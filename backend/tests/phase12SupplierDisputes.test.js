jest.mock('../src/services/authService', () => ({
  getActiveUser: jest.fn(),
}));
jest.mock('../src/services/supplierService', () => ({
  list: jest.fn(),
  get: jest.fn(),
}));
jest.mock('../src/services/disputeService', () => ({
  create: jest.fn(),
  list: jest.fn(),
}));
jest.mock('../src/services/analyticsService', () => ({
  getForUser: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const env = require('../src/config/env');
const authService = require('../src/services/authService');
const supplierService = require('../src/services/supplierService');
const disputeService = require('../src/services/disputeService');
const analyticsService = require('../src/services/analyticsService');

const supplier = {
  id: 'e6b98e7c-e369-40c7-a165-b3026a2cdab1',
  email: 'supplier@example.com',
  roles: ['SUPPLIER'],
};
const orderId = 'e6b98e7c-e369-40c7-a165-b3026a2cdab2';

function tokenFor() {
  return jwt.sign({ sub: supplier.id }, env.jwtSecret, { algorithm: 'HS256' });
}

describe('Phase 12 supplier, dispute, and analytics APIs', () => {
  afterEach(() => jest.clearAllMocks());

  it('lists the verified supplier directory with validated pagination and search', async () => {
    supplierService.list.mockResolvedValue({ data: [], page: 1, limit: 5, total: 0, totalPages: 0 });
    const response = await request(app).get('/api/suppliers?search=tools&limit=5');
    expect(response.status).toBe(200);
    expect(supplierService.list).toHaveBeenCalledWith({ page: 1, limit: 5, search: 'tools' });
  });

  it('allows order parties to create and list disputes but requires authentication', async () => {
    authService.getActiveUser.mockResolvedValue(supplier);
    disputeService.create.mockResolvedValue({ id: orderId, status: 'OPEN' });
    disputeService.list.mockResolvedValue({ data: [], page: 1, limit: 20, total: 0, totalPages: 0 });
    const token = tokenFor();
    const created = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId,
        type: 'ORDER_NOT_RECEIVED',
        title: 'Shipment is delayed',
        description: 'The shipment has not moved for several days.',
      });
    expect(created.status).toBe(201);
    expect(disputeService.create).toHaveBeenCalledWith(supplier, {
      orderId,
      type: 'ORDER_NOT_RECEIVED',
      title: 'Shipment is delayed',
      description: 'The shipment has not moved for several days.',
    });

    const list = await request(app)
      .get('/api/disputes?status=OPEN')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(disputeService.list).toHaveBeenCalledWith(supplier, {
      page: 1,
      limit: 20,
      status: 'OPEN',
    });
    expect((await request(app).get('/api/disputes')).status).toBe(401);
  });

  it('blocks suspended supplier accounts from supplier endpoints', async () => {
    authService.getActiveUser.mockResolvedValue({ ...supplier, supplier_suspended: true });
    const response = await request(app)
      .get('/api/quotations')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(response.status).toBe(403);
  });

  it('returns role-specific analytics only to authenticated workspace users', async () => {
    authService.getActiveUser.mockResolvedValue(supplier);
    analyticsService.getForUser.mockResolvedValue({ active_products: 3, low_stock_items: 1 });
    const response = await request(app)
      .get('/api/analytics/me')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(response.status).toBe(200);
    expect(response.body.data.low_stock_items).toBe(1);
    expect(analyticsService.getForUser).toHaveBeenCalledWith(supplier);
  });
});
