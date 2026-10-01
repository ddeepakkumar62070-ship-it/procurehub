jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn() },
  query: jest.fn(),
}));

const { pool } = require('../src/config/db');
const { createPurchaseRequest, cancelBuyerRequest } = require('../src/services/purchaseRequestService');

describe('Purchase request service transactions', () => {
  let client;

  beforeEach(() => {
    client = {
      query: jest.fn(),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(client);
  });

  afterEach(() => jest.clearAllMocks());

  it('creates the request and all item rows in one transaction', async () => {
    const productIds = [
      'e6b98e7c-e369-40c7-a165-b3026a2cdab4',
      'e6b98e7c-e369-40c7-a165-b3026a2cdab5',
    ];
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          { id: productIds[0], name: 'Rice', sku: 'RICE-01' },
          { id: productIds[1], name: 'Oil', sku: 'OIL-01' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ request_number: 'PR-20990510-00000001' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'request-id' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: 'request-id',
          request_number: 'PR-20990510-00000001',
          title: 'Kitchen essentials',
        }],
      })
      .mockResolvedValueOnce({
        rows: [
          { product_id: productIds[0], product_name: 'Rice', quantity: 3 },
          { product_id: productIds[1], product_name: 'Oil', quantity: 2 },
        ],
      })
      .mockResolvedValueOnce({});

    const result = await createPurchaseRequest('buyer-id', {
      title: 'Kitchen essentials',
      requiredDeliveryDate: '2099-05-10',
      deliveryLocation: { address: 'Main Street', city: 'Pune', country: 'India' },
      items: [
        { productId: productIds[0], quantity: 3 },
        { productId: productIds[1], quantity: 2 },
      ],
    });

    expect(result.items).toHaveLength(2);
    expect(client.query.mock.calls[0][0]).toBe('BEGIN');
    expect(client.query.mock.calls[4][1]).toEqual([
      'request-id', productIds[0], 'Rice', 'RICE-01', 3,
    ]);
    expect(client.query.mock.calls[5][1]).toEqual([
      'request-id', productIds[1], 'Oil', 'OIL-01', 2,
    ]);
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back when any requested product is inactive or missing', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});

    await expect(createPurchaseRequest('buyer-id', {
      title: 'Kitchen essentials',
      requiredDeliveryDate: '2099-05-10',
      deliveryLocation: { address: 'Main Street', city: 'Pune', country: 'India' },
      items: [{ productId: 'missing-product', quantity: 3 }],
    })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });

    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('cancels only open requests and commits the status transition', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'request-id' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'request-id', status: 'CANCELLED' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});

    const result = await cancelBuyerRequest('buyer-id', 'request-id');

    expect(result.status).toBe('CANCELLED');
    expect(client.query.mock.calls[1][0]).toContain("status = 'CANCELLED'");
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
  });
});
