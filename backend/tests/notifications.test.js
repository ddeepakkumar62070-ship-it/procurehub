jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn() },
  query: jest.fn(),
}));
jest.mock('../src/services/authService', () => ({
  getActiveUser: jest.fn(),
}));
jest.mock('../src/services/notificationService', () => ({
  listForUser: jest.fn(),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const authService = require('../src/services/authService');
const notificationService = require('../src/services/notificationService');
const env = require('../src/config/env');

const user = {
  id: 'e6b98e7c-e369-40c7-a165-b3026a2cdab1',
  email: 'supplier@example.com',
  roles: ['SUPPLIER'],
};

function tokenFor() {
  return jwt.sign({ sub: user.id }, env.jwtSecret, { algorithm: 'HS256' });
}

describe('Notification APIs', () => {
  afterEach(() => jest.clearAllMocks());

  it('lists only the authenticated user notifications using validated pagination', async () => {
    authService.getActiveUser.mockResolvedValue(user);
    notificationService.listForUser.mockResolvedValue({
      data: [{ id: 'notification-1', type: 'NEW_PURCHASE_REQUEST' }],
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });

    const response = await request(app)
      .get('/api/notifications?limit=10&unreadOnly=true')
      .set('Authorization', `Bearer ${tokenFor()}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].type).toBe('NEW_PURCHASE_REQUEST');
    expect(notificationService.listForUser).toHaveBeenCalledWith(user.id, {
      page: 1,
      limit: 10,
      unreadOnly: true,
    });
  });

  it('marks a notification read and supports marking all read', async () => {
    authService.getActiveUser.mockResolvedValue(user);
    notificationService.markRead.mockResolvedValue({
      id: 'e6b98e7c-e369-40c7-a165-b3026a2cdab2',
      read_at: '2026-10-02T00:00:00.000Z',
    });
    notificationService.markAllRead.mockResolvedValue({ updated: 3 });
    const token = tokenFor();

    const one = await request(app)
      .patch('/api/notifications/e6b98e7c-e369-40c7-a165-b3026a2cdab2/read')
      .set('Authorization', `Bearer ${token}`);
    const all = await request(app)
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);

    expect(one.status).toBe(200);
    expect(notificationService.markRead).toHaveBeenCalledWith(
      user.id,
      'e6b98e7c-e369-40c7-a165-b3026a2cdab2'
    );
    expect(all.status).toBe(200);
    expect(all.body.data.updated).toBe(3);
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/notifications');
    expect(response.status).toBe(401);
  });
});
