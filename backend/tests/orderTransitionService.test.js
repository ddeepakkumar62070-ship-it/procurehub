jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn() },
  query: jest.fn(),
}));

const { pool } = require('../src/config/db');
const orderTransitionService = require('../src/services/orderTransitionService');

describe('OrderTransitionService', () => {
  let client;

  beforeEach(() => {
    client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
  });

  afterEach(() => jest.clearAllMocks());

  it('creates an order and initial audit from an accepted quotation', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          quotation_id: 'quotation-id',
          purchase_request_id: 'request-id',
          supplier_user_id: 'supplier-id',
          quotation_status: 'ACCEPTED',
          buyer_user_id: 'buyer-id',
          purchase_request_status: 'QUOTATION_ACCEPTED',
          currency: 'USD',
          subtotal: '49.50',
          delivery_time_days: 5,
          required_delivery_date: '2099-05-10',
          delivery_location: { city: 'Austin' },
          notes: null,
          request_item_count: 2,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ order_number: 'PO-20990510-00000001' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'order-id', order_number: 'PO-20990510-00000001', status: 'PO_CREATED' }],
      })
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({});

    const order = await orderTransitionService.createFromAcceptedQuotation(client, {
      quotationId: 'quotation-id',
      purchaseRequestId: 'request-id',
      buyerUserId: 'buyer-id',
    });

    expect(order.status).toBe('PO_CREATED');
    expect(client.query.mock.calls[2][0]).toContain("status, currency, subtotal");
    expect(client.query.mock.calls[3][0]).toContain('FROM quotation_items');
    expect(client.query.mock.calls[4][0]).toContain('purchase_order_audit_logs');
    expect(client.query.mock.calls[4][1]).toEqual([
      'order-id', 'QUOTATION_ACCEPTED', 'PO_CREATED', 'buyer-id', 'BUYER', null,
    ]);
    expect(client.query.mock.calls[2][1][4]).toBe('supplier-id');
  });

  it('commits a permitted transition with an audit row and a row lock', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: 'order-id',
          buyer_user_id: 'buyer-id',
          supplier_user_id: 'supplier-id',
          status: 'PO_CREATED',
        }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 'order-id', order_number: 'PO-1', status: 'CONFIRMED' }],
      })
      .mockResolvedValueOnce({});

    const result = await orderTransitionService.transitionPurchaseOrder(
      'order-id',
      { id: 'supplier-id', roles: ['SUPPLIER'] },
      { status: 'CONFIRMED', reason: 'Order acknowledged' }
    );

    expect(result.status).toBe('CONFIRMED');
    expect(client.query.mock.calls[1][0]).toContain('FOR UPDATE OF po');
    expect(client.query.mock.calls[2][0]).toContain('purchase_order_audit_logs');
    expect(client.query.mock.calls[3][0]).toContain('confirmed_at = NOW()');
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
  });

  it('rolls back invalid transitions without updating or auditing', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: 'order-id',
          buyer_user_id: 'buyer-id',
          supplier_user_id: 'supplier-id',
          status: 'PO_CREATED',
        }],
      })
      .mockResolvedValueOnce({});

    await expect(orderTransitionService.transitionPurchaseOrder(
      'order-id',
      { id: 'supplier-id', roles: ['SUPPLIER'] },
      { status: 'SHIPPED' }
    )).rejects.toMatchObject({ code: 'INVALID_ORDER_TRANSITION' });

    expect(client.query.mock.calls).toHaveLength(3);
    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });

  it('rolls back when a party has the wrong role for a valid transition', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: 'order-id',
          buyer_user_id: 'buyer-id',
          supplier_user_id: 'supplier-id',
          status: 'PO_CREATED',
        }],
      })
      .mockResolvedValueOnce({});

    await expect(orderTransitionService.transitionPurchaseOrder(
      'order-id',
      { id: 'buyer-id', roles: ['BUYER'] },
      { status: 'CONFIRMED' }
    )).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });

  it('does not allow a non-party to transition an order', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});

    await expect(orderTransitionService.transitionPurchaseOrder(
      'order-id',
      { id: 'unrelated-buyer-id', roles: ['BUYER'] },
      { status: 'CANCELLED' }
    )).rejects.toMatchObject({ statusCode: 404 });
    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });
});
