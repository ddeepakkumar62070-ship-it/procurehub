jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn() },
  query: jest.fn(),
}));
jest.mock('../src/services/inventoryReservationService', () => ({
  reserveForOrder: jest.fn().mockResolvedValue([{ id: 'reservation-id' }]),
  confirmForOrder: jest.fn().mockResolvedValue(1),
  releaseForOrder: jest.fn().mockResolvedValue(1),
  consumeForOrder: jest.fn().mockResolvedValue(1),
  restoreReturnedInventory: jest.fn().mockResolvedValue(1),
  expireOverdueReservations: jest.fn(),
}));
jest.mock('../src/services/invoiceService', () => ({
  createForOrder: jest.fn().mockResolvedValue({ id: 'invoice-id' }),
}));
jest.mock('../src/services/notificationService', () => ({
  createInTransaction: jest.fn(),
}));

const { pool } = require('../src/config/db');
const orderTransitionService = require('../src/services/orderTransitionService');
const inventoryReservationService = require('../src/services/inventoryReservationService');
const invoiceService = require('../src/services/invoiceService');
const notificationService = require('../src/services/notificationService');
const env = require('../src/config/env');

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
    expect(inventoryReservationService.reserveForOrder).toHaveBeenCalledWith(
      client,
      { orderId: 'order-id', supplierUserId: 'supplier-id', currency: 'USD' }
    );
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
    expect(inventoryReservationService.confirmForOrder).toHaveBeenCalledWith(client, 'order-id');
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

  it('releases reservations transactionally when an order is cancelled', async () => {
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
      .mockResolvedValueOnce({ rows: [{ id: 'order-id', status: 'CANCELLED' }] })
      .mockResolvedValueOnce({});

    await orderTransitionService.transitionPurchaseOrder(
      'order-id',
      { id: 'buyer-id', roles: ['BUYER'] },
      { status: 'CANCELLED' }
    );

    expect(inventoryReservationService.releaseForOrder).toHaveBeenCalledWith(client, 'order-id');
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
  });

  it('consumes confirmed reservations transactionally when an order ships', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: 'order-id',
          buyer_user_id: 'buyer-id',
          supplier_user_id: 'supplier-id',
          status: 'PROCESSING',
        }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'order-id', status: 'SHIPPED' }] })
      .mockResolvedValueOnce({});

    await orderTransitionService.transitionPurchaseOrder(
      'order-id',
      { id: 'supplier-id', roles: ['SUPPLIER'] },
      { status: 'SHIPPED' }
    );

    expect(inventoryReservationService.consumeForOrder).toHaveBeenCalledWith(client, 'order-id');
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
  });

  it('restores consumed inventory only when the supplier accepts a return', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 'order-id', buyer_user_id: 'buyer-id', supplier_user_id: 'supplier-id', status: 'RETURN_REQUESTED' }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'order-id', status: 'RETURNED' }] })
      .mockResolvedValueOnce({});

    await orderTransitionService.transitionPurchaseOrder(
      'order-id',
      { id: 'supplier-id', roles: ['SUPPLIER'] },
      { status: 'RETURNED' }
    );

    expect(inventoryReservationService.restoreReturnedInventory).toHaveBeenCalledWith(client, 'order-id');
    expect(client.query.mock.calls[2][0]).toContain('purchase_order_audit_logs');
    expect(client.query.mock.calls[2][1]).toEqual([
      'order-id', 'RETURN_REQUESTED', 'RETURNED', 'supplier-id', 'SUPPLIER', null,
    ]);
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
  });

  it('does not restore inventory again when RETURNED is submitted a second time', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 'order-id', buyer_user_id: 'buyer-id', supplier_user_id: 'supplier-id', status: 'RETURNED' }],
      })
      .mockResolvedValueOnce({});

    await expect(orderTransitionService.transitionPurchaseOrder(
      'order-id',
      { id: 'supplier-id', roles: ['SUPPLIER'] },
      { status: 'RETURNED' }
    )).rejects.toMatchObject({ code: 'INVALID_ORDER_TRANSITION' });

    expect(inventoryReservationService.restoreReturnedInventory).not.toHaveBeenCalled();
    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });

  it('sends supplier fulfilment updates only to the buyer', async () => {
    const priorNodeEnv = env.nodeEnv;
    env.nodeEnv = 'development';
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 'order-id', order_number: 'PO-1', buyer_user_id: 'buyer-id', supplier_user_id: 'supplier-id', status: 'PO_CREATED' }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'order-id', status: 'CONFIRMED' }] })
      .mockResolvedValueOnce({});

    try {
      await orderTransitionService.transitionPurchaseOrder(
        'order-id',
        { id: 'supplier-id', roles: ['SUPPLIER'] },
        { status: 'CONFIRMED' }
      );
      expect(notificationService.createInTransaction).toHaveBeenCalledWith(client, expect.objectContaining({
        userId: 'buyer-id', type: 'ORDER_CONFIRMED',
      }));
    } finally {
      env.nodeEnv = priorNodeEnv;
    }
  });

  it('creates the invoice in the same transaction as the invoice-generated transition', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: 'order-id',
          buyer_user_id: 'buyer-id',
          supplier_user_id: 'supplier-id',
          status: 'DELIVERED',
        }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'order-id', status: 'INVOICE_GENERATED' }] })
      .mockResolvedValueOnce({});

    await orderTransitionService.transitionPurchaseOrder(
      'order-id',
      { id: 'supplier-id', roles: ['SUPPLIER'] },
      { status: 'INVOICE_GENERATED' }
    );

    expect(invoiceService.createForOrder).toHaveBeenCalledWith(client, 'order-id');
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
  });
});
