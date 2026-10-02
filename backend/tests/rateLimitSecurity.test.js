jest.mock('../src/config/redis', () => ({
  redisClient: {
    isOpen: true,
    eval: jest.fn(),
  },
}));

const { redisClient } = require('../src/config/redis');
const createRateLimit = require('../src/middleware/rateLimitMiddleware');

describe('authentication rate limiting', () => {
  afterEach(() => jest.clearAllMocks());

  it('rejects requests after the configured Redis-backed limit', async () => {
    redisClient.eval.mockResolvedValue([11, 900]);
    const middleware = createRateLimit({ limit: 10, windowSeconds: 900 });
    const req = { ip: '192.0.2.10', socket: { remoteAddress: '192.0.2.10' } };
    const res = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await middleware(req, res, next);

    expect(redisClient.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: [expect.stringContaining(':192.0.2.10')],
      arguments: ['900'],
    });
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' }),
    }));
    expect(next).not.toHaveBeenCalled();
  });
});
