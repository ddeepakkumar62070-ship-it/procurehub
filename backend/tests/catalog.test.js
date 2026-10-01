jest.mock('../src/services/authService', () => ({
  getActiveUser: jest.fn(),
}));

jest.mock('../src/services/catalogService', () => ({
  listCategories: jest.fn(),
  createCategory: jest.fn(),
  updateCategory: jest.fn(),
  deactivateCategory: jest.fn(),
  createProduct: jest.fn(),
  updateProduct: jest.fn(),
  deactivateProduct: jest.fn(),
  listProducts: jest.fn(),
  getProduct: jest.fn(),
  createSupplierProduct: jest.fn(),
  listSupplierProducts: jest.fn(),
  updateSupplierProduct: jest.fn(),
  listInventory: jest.fn(),
  updateInventory: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const authService = require('../src/services/authService');
const catalogService = require('../src/services/catalogService');
const env = require('../src/config/env');

const supplier = {
  id: 'e6b98e7c-e369-40c7-a165-b3026a2cdab1',
  email: 'supplier@example.com',
  first_name: 'Sam',
  last_name: 'Supplier',
  roles: ['SUPPLIER'],
};

function tokenFor(user = supplier) {
  return jwt.sign({ sub: user.id }, env.jwtSecret, { algorithm: 'HS256' });
}

describe('Catalog, supplier products, and inventory routes', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns paginated product results and accepts supported filters', async () => {
    catalogService.listProducts.mockResolvedValue({
      data: [{ id: 'product-1', name: 'Basmati rice' }],
      page: 2,
      limit: 5,
      total: 6,
      totalPages: 2,
    });
    const response = await request(app).get(
      '/api/catalog/products?keyword=rice&minPrice=10&maxPrice=50&currency=USD&availability=true&page=2&limit=5&sort=price_asc'
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.page).toBe(2);
    expect(response.body.totalPages).toBe(2);
    expect(catalogService.listProducts).toHaveBeenCalledWith(expect.objectContaining({
      keyword: 'rice',
      minPrice: 10,
      maxPrice: 50,
      currency: 'USD',
      availability: 'true',
      page: 2,
      limit: 5,
      sort: 'price_asc',
    }));
  });

  it('rejects invalid query pagination, filters, and sort without querying', async () => {
    const response = await request(app).get('/api/catalog/products?page=0&sort=unit_price;drop');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(catalogService.listProducts).not.toHaveBeenCalled();
  });

  it('rejects inverted price ranges', async () => {
    const response = await request(app).get('/api/catalog/products?minPrice=20&maxPrice=10&currency=USD');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires a currency when using price bounds or price sorting', async () => {
    const response = await request(app).get('/api/catalog/products?minPrice=10&sort=price_asc');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('prevents buyers from creating supplier products', async () => {
    const buyer = { ...supplier, roles: ['BUYER'] };
    authService.getActiveUser.mockResolvedValue(buyer);
    const response = await request(app)
      .post('/api/supplier-products')
      .set('Authorization', `Bearer ${tokenFor(buyer)}`)
      .send({
        productId: 'e6b98e7c-e369-40c7-a165-b3026a2cdab2',
        unitPrice: 20,
        currency: 'USD',
        totalQuantity: 5,
      });

    expect(response.status).toBe(403);
    expect(catalogService.createSupplierProduct).not.toHaveBeenCalled();
  });

  it('validates initial inventory quantities before creating an offer', async () => {
    authService.getActiveUser.mockResolvedValue(supplier);
    const response = await request(app)
      .post('/api/supplier-products')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({
        productId: 'e6b98e7c-e369-40c7-a165-b3026a2cdab2',
        unitPrice: -1,
        currency: 'USD',
        totalQuantity: -3,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(catalogService.createSupplierProduct).not.toHaveBeenCalled();
  });

  it('allows suppliers to update only validated stock fields', async () => {
    authService.getActiveUser.mockResolvedValue(supplier);
    catalogService.updateInventory.mockResolvedValue({
      supplier_product_id: 'e6b98e7c-e369-40c7-a165-b3026a2cdab2',
      total_quantity: 8,
      available_quantity: 6,
      reserved_quantity: 2,
      reorder_level: 3,
    });
    const response = await request(app)
      .patch('/api/inventory/e6b98e7c-e369-40c7-a165-b3026a2cdab2')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ totalQuantity: 8, reorderLevel: 3 });

    expect(response.status).toBe(200);
    expect(response.body.data.available_quantity).toBe(6);
    expect(catalogService.updateInventory).toHaveBeenCalledWith(
      supplier.id,
      'e6b98e7c-e369-40c7-a165-b3026a2cdab2',
      { totalQuantity: 8, reorderLevel: 3 }
    );
  });

  it('rejects attempts to set derived inventory fields directly', async () => {
    authService.getActiveUser.mockResolvedValue(supplier);
    const response = await request(app)
      .patch('/api/inventory/e6b98e7c-e369-40c7-a165-b3026a2cdab2')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ availableQuantity: -1, reservedQuantity: 8 });

    expect(response.status).toBe(400);
    expect(catalogService.updateInventory).not.toHaveBeenCalled();
  });
});
