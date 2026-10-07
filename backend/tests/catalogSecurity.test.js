jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn() },
  query: jest.fn(),
}));
const { query } = require('../src/config/db');
const catalogService = require('../src/services/catalogService');

describe('public catalog supplier visibility', () => {
  afterEach(() => jest.clearAllMocks());

  it('only returns offers from active, verified, non-suspended suppliers', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'product-1', name: 'Rice' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(catalogService.getProduct('product-1')).resolves.toMatchObject({
      id: 'product-1',
      supplierProducts: [],
    });

    expect(query.mock.calls[1][0]).toContain("sup.verification_status = 'VERIFIED'");
    expect(query.mock.calls[1][0]).toContain('sup.is_suspended = FALSE');
    expect(query.mock.calls[1][0]).toContain('u.is_active = TRUE');
  });

  it('applies the same supplier eligibility rules to marketplace search and price sorting', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(catalogService.listProducts({
      page: 1,
      limit: 20,
      sort: 'price_asc',
      currency: 'USD',
    })).resolves.toMatchObject({ data: [], total: 0 });

    const sql = query.mock.calls[1][0];
    expect(sql).toContain("eligible_supplier.verification_status = 'VERIFIED'");
    expect(sql).toContain('eligible_supplier.is_suspended = FALSE');
    expect(sql).toContain("sort_supplier.verification_status = 'VERIFIED'");
    expect(sql).toContain('sort_supplier.is_suspended = FALSE');
  });
});
