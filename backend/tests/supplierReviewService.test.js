jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn() },
  query: jest.fn(),
}));

const { pool, query } = require('../src/config/db');
const reviewService = require('../src/services/supplierReviewService');

describe('SupplierReviewService', () => {
  let client;
  const buyer = { id: 'buyer-id', roles: ['BUYER'] };

  beforeEach(() => {
    client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
  });
  afterEach(() => jest.clearAllMocks());

  it('creates a review only for a buyer-owned delivered order and refreshes the supplier summary', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'order-id', supplier_user_id: 'supplier-id', status: 'DELIVERED' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'review-id', purchase_order_id: 'order-id', rating: 5, review_text: 'Excellent', created_at: '2026-10-08' }] })
      .mockResolvedValueOnce({ rows: [{ rating_average: '5.00', rating_count: 1 }] })
      .mockResolvedValueOnce({});

    const result = await reviewService.create('order-id', buyer, { rating: 5, review: 'Excellent' });

    expect(result.summary).toEqual({ rating_average: '5.00', rating_count: 1 });
    expect(client.query.mock.calls[1][1]).toEqual(['order-id', 'buyer-id']);
    expect(client.query.mock.calls[2][0]).toContain('ON CONFLICT (purchase_order_id) DO NOTHING');
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
  });

  it('rejects reviews for an incomplete order without inserting anything', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'order-id', supplier_user_id: 'supplier-id', status: 'SHIPPED' }] })
      .mockResolvedValueOnce({});
    await expect(reviewService.create('order-id', buyer, { rating: 4 })).rejects.toMatchObject({ code: 'ORDER_NOT_REVIEWABLE' });
    expect(client.query.mock.calls).toHaveLength(3);
  });

  it('rejects a duplicate review and rolls back without changing the rating summary', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'order-id', supplier_user_id: 'supplier-id', status: 'COMPLETED' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});
    await expect(reviewService.create('order-id', buyer, { rating: 4 })).rejects.toMatchObject({ code: 'SUPPLIER_REVIEW_EXISTS' });
    expect(client.query.mock.calls).toHaveLength(4);
  });

  it('rejects a supplier attempting to review', async () => {
    await expect(reviewService.create('order-id', { id: 'supplier-id', roles: ['SUPPLIER'] }, { rating: 5 }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('reports eligibility and an existing review only for the order owner', async () => {
    query.mockResolvedValueOnce({ rows: [{ purchase_order_id: 'order-id', status: 'DELIVERED', id: 'review-id', rating: 4, review_text: 'Good', created_at: '2026-10-08' }] });
    await expect(reviewService.getForOrder('order-id', buyer)).resolves.toEqual({
      eligible: true,
      review: { id: 'review-id', rating: 4, review: 'Good', created_at: '2026-10-08' },
    });
    expect(query.mock.calls[0][1]).toEqual(['order-id', 'buyer-id']);
  });
});
