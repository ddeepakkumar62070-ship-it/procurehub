jest.mock('../src/services/authService', () => ({
  getActiveUser: jest.fn(),
}));
jest.mock('../src/services/adminService', () => ({
  getDashboard: jest.fn(),
  listUsers: jest.fn(),
  updateUserActive: jest.fn(),
  listSuppliers: jest.fn(),
  updateSupplierVerification: jest.fn(),
  listOrders: jest.fn(),
  getOrder: jest.fn(),
  listAuditLogs: jest.fn(),
}));
jest.mock('../src/services/disputeService', () => ({
  list: jest.fn(),
  updateStatus: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const env = require('../src/config/env');
const authService = require('../src/services/authService');
const adminService = require('../src/services/adminService');
const disputeService = require('../src/services/disputeService');

const admin = {
  id: 'e6b98e7c-e369-40c7-a165-b3026a2cdab1',
  email: 'admin@example.com',
  roles: ['ADMIN'],
};
const userId = 'e6b98e7c-e369-40c7-a165-b3026a2cdab2';

function tokenFor(user = admin) {
  return jwt.sign({ sub: user.id }, env.jwtSecret, { algorithm: 'HS256' });
}

describe('Phase 12 administration APIs', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns dashboard metrics to admins and rejects other roles', async () => {
    authService.getActiveUser.mockResolvedValue(admin);
    adminService.getDashboard.mockResolvedValue({ users: 4, active_orders: 2 });
    const response = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${tokenFor()}`);

    expect(response.status).toBe(200);
    expect(response.body.data.users).toBe(4);

    authService.getActiveUser.mockResolvedValue({ ...admin, roles: ['BUYER'] });
    const forbidden = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(forbidden.status).toBe(403);
  });

  it('validates admin user filters and updates account activation', async () => {
    authService.getActiveUser.mockResolvedValue(admin);
    adminService.listUsers.mockResolvedValue({ data: [], page: 2, limit: 10, total: 0, totalPages: 0 });
    const list = await request(app)
      .get('/api/admin/users?page=2&limit=10&active=false&role=SUPPLIER')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(list.status).toBe(200);
    expect(adminService.listUsers).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      active: false,
      role: 'SUPPLIER',
    });

    const invalid = await request(app)
      .get('/api/admin/users?limit=1000')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(invalid.status).toBe(400);

    adminService.updateUserActive.mockResolvedValue({ id: userId, is_active: false });
    const update = await request(app)
      .patch(`/api/admin/users/${userId}`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ isActive: false });
    expect(update.status).toBe(200);
    expect(adminService.updateUserActive).toHaveBeenCalledWith(userId, false, admin.id);
  });

  it('restricts dispute status changes to admins and validates resolution notes', async () => {
    authService.getActiveUser.mockResolvedValue(admin);
    disputeService.updateStatus.mockResolvedValue({ id: userId, status: 'UNDER_REVIEW' });
    const response = await request(app)
      .patch(`/api/admin/disputes/${userId}`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ status: 'UNDER_REVIEW' });
    expect(response.status).toBe(200);
    expect(disputeService.updateStatus).toHaveBeenCalledWith(admin, userId, {
      status: 'UNDER_REVIEW',
    });

    const invalid = await request(app)
      .patch(`/api/admin/disputes/${userId}`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ status: 'RESOLVED' });
    expect(invalid.status).toBe(400);
  });
});
