jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn() },
  query: jest.fn(),
}));
jest.mock('../src/services/orderTransitionService', () => ({
  createFromAcceptedQuotation: jest.fn().mockResolvedValue({
    id: 'purchase-order-id',
    order_number: 'PO-20990510-00000001',
    status: 'PO_CREATED',
  }),
}));

const { pool, query } = require('../src/config/db');
const orderTransitionService = require('../src/services/orderTransitionService');
const {
  submitQuotation,
  listSupplierQuotations,
  acceptQuotation,
  rejectQuotation,
} = require('../src/services/quotationService');

describe('Quotation transactional state changes', () => {
  let client;

  beforeEach(() => {
    client = {
      query: jest.fn(),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(client);
  });

  afterEach(() => jest.clearAllMocks());

  it('submits quoted quantities and selects the matching currency offer', async () => {
    const requestItemId = 'request-item-id';
    const productId = 'product-id';
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 'request-id', status: 'OPEN', required_delivery_date: '2099-05-10' }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: requestItemId,
          product_id: productId,
          product_name: 'Rice',
          product_sku: 'RICE-01',
          quantity: 3,
        }],
      })
      .mockResolvedValueOnce({
        rows: [
          { product_id: productId, currency: 'USD', available_quantity: 8 },
          { product_id: productId, currency: 'EUR', available_quantity: 4 },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ quotation_number: 'QT-20990510-00000001' }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'quotation-id',
          quotation_number: 'QT-20990510-00000001',
          status: 'SUBMITTED',
          subtotal: '37.50',
        }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const result = await submitQuotation('supplier-id', 'request-id', {
      currency: 'EUR',
      deliveryTimeDays: 5,
      validUntil: '2099-05-12T12:00:00Z',
      items: [{ purchaseRequestItemId: requestItemId, quantity: 4, unitPrice: 12.5 }],
    });

    expect(result.subtotal).toBe('50.00');
    expect(result.items[0].line_total).toBe('50.00');
    expect(client.query.mock.calls[6][1]).toEqual([
      'quotation-id', requestItemId, productId, 'Rice', 'RICE-01', 4, '12.50', '50.00',
    ]);
    expect(client.query.mock.calls[7][0]).toContain("status = 'QUOTATION_RECEIVED'");
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
  });

  it('rejects quoted quantities below the requested quantity', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 'request-id', status: 'OPEN', required_delivery_date: '2099-05-10' }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'request-item-id',
          product_id: 'product-id',
          product_name: 'Rice',
          product_sku: 'RICE-01',
          quantity: 3,
        }],
      })
      .mockResolvedValueOnce({});

    await expect(submitQuotation('supplier-id', 'request-id', {
      currency: 'USD',
      deliveryTimeDays: 5,
      validUntil: '2099-05-12T12:00:00Z',
      items: [{ purchaseRequestItemId: 'request-item-id', quantity: 2, unitPrice: 12.5 }],
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });

  it('rolls back a quotation when supplier stock cannot cover the request', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 'request-id', status: 'OPEN', required_delivery_date: '2099-05-10' }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'request-item-id',
          product_id: 'product-id',
          product_name: 'Rice',
          product_sku: 'RICE-01',
          quantity: 3,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ product_id: 'product-id', currency: 'USD', available_quantity: 2 }],
      })
      .mockResolvedValueOnce({});

    await expect(submitQuotation('supplier-id', 'request-id', {
      currency: 'USD',
      deliveryTimeDays: 5,
      validUntil: '2099-05-12T12:00:00Z',
      items: [{ purchaseRequestItemId: 'request-item-id', quantity: 3, unitPrice: 12.5 }],
    })).rejects.toMatchObject({
      code: 'SUPPLIER_NOT_ELIGIBLE',
    });
    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });

  it('accepts one quotation and rejects its siblings in the same transaction', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ purchase_request_id: 'request-id' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'request-id', status: 'QUOTATION_RECEIVED' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'quotation-id',
          status: 'SUBMITTED',
          valid_until: new Date(Date.now() + 60_000),
          is_expired: false,
        }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'quotation-id', status: 'ACCEPTED' }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const result = await acceptQuotation('buyer-id', 'quotation-id');

    expect(result.status).toBe('ACCEPTED');
    expect(result.purchaseOrder.status).toBe('PO_CREATED');
    expect(client.query.mock.calls[2][0]).toContain('FOR UPDATE');
    expect(client.query.mock.calls[4][0]).toContain("status = 'ACCEPTED'");
    expect(client.query.mock.calls[5][0]).toContain("status = CASE WHEN valid_until <= NOW()");
    expect(client.query.mock.calls[6][0]).toContain("status = 'QUOTATION_ACCEPTED'");
    expect(orderTransitionService.createFromAcceptedQuotation).toHaveBeenCalledWith(
      client,
      { quotationId: 'quotation-id', purchaseRequestId: 'request-id', buyerUserId: 'buyer-id' }
    );
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
  });

  it('rolls back quotation acceptance if purchase-order creation fails', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ purchase_request_id: 'request-id' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'request-id', status: 'QUOTATION_RECEIVED' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'quotation-id',
          status: 'SUBMITTED',
          valid_until: new Date(Date.now() + 60_000),
          is_expired: false,
        }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'quotation-id', status: 'ACCEPTED' }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    orderTransitionService.createFromAcceptedQuotation.mockRejectedValueOnce(
      new Error('purchase order insert failed')
    );

    await expect(acceptQuotation('buyer-id', 'quotation-id')).rejects.toThrow(
      'purchase order insert failed'
    );
    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });

  it('commits expiry state and refuses an expired quotation', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ purchase_request_id: 'request-id' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'request-id', status: 'QUOTATION_RECEIVED' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'quotation-id',
          status: 'SUBMITTED',
          valid_until: new Date(Date.now() - 60_000),
          is_expired: true,
        }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await expect(acceptQuotation('buyer-id', 'quotation-id')).rejects.toMatchObject({
      statusCode: 409,
      code: 'QUOTATION_EXPIRED',
    });
    expect(client.query.mock.calls[4][0]).toContain("status = 'EXPIRED'");
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
  });

  it('does not accept a quotation on a cancelled purchase request', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ purchase_request_id: 'request-id' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'request-id', status: 'CANCELLED' }] })
      .mockResolvedValueOnce({});

    await expect(acceptQuotation('buyer-id', 'quotation-id')).rejects.toMatchObject({
      code: 'PURCHASE_REQUEST_CANCELLED',
    });
    expect(client.query.mock.calls.some(([sql]) => sql.includes("status = 'ACCEPTED'"))).toBe(false);
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
  });

  it('rejects a quotation after its validity has elapsed and persists expiry', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ purchase_request_id: 'request-id' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'request-id', status: 'QUOTATION_RECEIVED' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'SUBMITTED', valid_until: new Date(Date.now() - 60_000) }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await expect(rejectQuotation('buyer-id', 'quotation-id')).rejects.toMatchObject({
      code: 'QUOTATION_EXPIRED',
    });
    expect(client.query.mock.calls.at(-2)[0]).toContain("status = 'EXPIRED'");
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
  });

  it('persists expired quotations when a supplier requests quotation data', async () => {
    query
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(listSupplierQuotations('supplier-id', { page: 1, limit: 20 }))
      .resolves.toMatchObject({ data: [], total: 0 });

    expect(query.mock.calls[0][0]).toContain("status = 'EXPIRED'");
    expect(query.mock.calls[0][0]).toContain('valid_until <= NOW()');
  });
});
