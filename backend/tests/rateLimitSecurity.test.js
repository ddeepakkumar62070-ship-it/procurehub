const createRateLimit = require('../src/middleware/rateLimitMiddleware');

describe('authentication rate limiting', () => {
  it('rejects requests above the configured limit', () => {
    const middleware = createRateLimit({ limit: 2, windowSeconds: 900 });
    const req = { ip: '192.0.2.10', socket: { remoteAddress: '192.0.2.10' } };
    const res = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    middleware(req, res, next);
    middleware(req, res, next);
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' }),
    }));
    expect(next).toHaveBeenCalledTimes(2);
  });
});
