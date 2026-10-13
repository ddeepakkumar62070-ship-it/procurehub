jest.mock('../src/services/authService', () => ({
  register: jest.fn(),
  login: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  getActiveUser: jest.fn(),
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const authService = require('../src/services/authService');
const env = require('../src/config/env');
const { requireRole } = require('../src/middleware/authMiddleware');

const user = {
  id: 'e6b98e7c-e369-40c7-a165-b3026a2cdab1',
  email: 'buyer@example.com',
  first_name: 'Asha',
  last_name: 'Buyer',
  roles: ['BUYER'],
};

describe('Authentication and profile routes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('registers a buyer and sets its refresh token as an HTTP-only cookie', async () => {
    authService.register.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'opaque-refresh-token',
      refreshTokenExpiresAt: new Date(Date.now() + 60_000),
      user: { id: user.id, email: user.email, roles: ['BUYER'] },
    });

    const response = await request(app).post('/api/auth/register').send({
      firstName: 'Asha',
      lastName: 'Buyer',
      email: user.email,
      password: 'a-long-secure-password',
      role: 'BUYER',
      businessName: 'Asha Foods',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.accessToken).toBe('access-token');
    expect(response.body.data.user.roles).toEqual(['BUYER']);
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('Path=/api/auth');
    expect(authService.register).toHaveBeenCalledWith(expect.objectContaining({
      email: user.email,
      role: 'BUYER',
    }));
  });

  it('revokes the refresh token and clears its cookie on logout', async () => {
    authService.logout.mockResolvedValue(undefined);
    const response = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `${env.refreshCookieName}=opaque-refresh-token`);

    expect(response.status).toBe(200);
    expect(response.body.data.loggedOut).toBe(true);
    expect(authService.logout).toHaveBeenCalledWith('opaque-refresh-token');
    expect(response.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
    expect(response.headers['set-cookie'][0]).not.toContain('Max-Age=604800');
  });

  it('rejects cross-origin refresh requests before using the refresh cookie', async () => {
    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'https://attacker.example')
      .set('Cookie', `${env.refreshCookieName}=opaque-refresh-token`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(authService.refresh).not.toHaveBeenCalled();
  });

  it('rotates a valid refresh-cookie session and returns a new access token', async () => {
    authService.refresh.mockResolvedValue({
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
      user: { id: user.id, email: user.email, roles: ['BUYER'] },
    });

    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${env.refreshCookieName}=valid-refresh-token`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      accessToken: 'rotated-access-token',
      user: { id: user.id, email: user.email, roles: ['BUYER'] },
    });
    expect(response.headers['set-cookie'][0]).toContain(`${env.refreshCookieName}=rotated-refresh-token`);
    expect(authService.refresh).toHaveBeenCalledWith('valid-refresh-token');
  });

  it('rejects public admin registration before calling the service', async () => {
    const response = await request(app).post('/api/auth/register').send({
      firstName: 'Platform',
      lastName: 'Admin',
      email: 'admin@example.com',
      password: 'a-long-secure-password',
      role: 'ADMIN',
      businessName: 'Platform',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('requires a valid bearer access token for the current-user route', async () => {
    const unauthorized = await request(app).get('/api/auth/me');
    expect(unauthorized.status).toBe(401);

    authService.getActiveUser.mockResolvedValue(user);
    const accessToken = jwt.sign({ sub: user.id }, env.jwtSecret, { algorithm: 'HS256' });
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.roles).toEqual(['BUYER']);
    expect(authService.getActiveUser).toHaveBeenCalledWith(user.id);
  });

  it('rejects bearer authorization headers containing extra tokens', async () => {
    const accessToken = jwt.sign({ sub: user.id }, env.jwtSecret, { algorithm: 'HS256' });
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken} unexpected`);

    expect(response.status).toBe(401);
    expect(authService.getActiveUser).not.toHaveBeenCalled();
  });

  it('denies a role-protected operation when the authenticated role is insufficient', () => {
    const next = jest.fn();
    requireRole('ADMIN')({ user }, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 403,
      code: 'FORBIDDEN',
    }));
  });

  it('rejects malformed profile updates with a consistent validation response', async () => {
    authService.getActiveUser.mockResolvedValue(user);
    const accessToken = jwt.sign({ sub: user.id }, env.jwtSecret, { algorithm: 'HS256' });
    const response = await request(app).patch('/api/profiles/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ unexpectedField: true });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(authService.updateProfile).not.toHaveBeenCalled();
  });
});
