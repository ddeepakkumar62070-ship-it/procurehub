jest.mock('../src/config/redis', () => ({
  redisClient: {
    isOpen: true,
    get: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
    del: jest.fn(),
    eval: jest.fn(),
  },
}));

const { redisClient } = require('../src/config/redis');
const redisData = require('../src/config/redisData');
const createRateLimit = require('../src/middleware/rateLimitMiddleware');
const { backoffStrategy, retryDelays } = require('../src/workers/workerFactory');
const { queueDefaults } = require('../src/queues/queueRegistry');

describe('Redis-backed infrastructure', () => {
  afterEach(() => jest.clearAllMocks());

  it('uses the configured retry delays and four total attempts', () => {
    expect(retryDelays).toEqual([5000, 30000, 120000]);
    expect(queueDefaults.attempts).toBe(4);
    expect(backoffStrategy(1, 'procurehub')).toBe(5000);
    expect(backoffStrategy(2, 'procurehub')).toBe(30000);
    expect(backoffStrategy(3, 'procurehub')).toBe(120000);
    expect(backoffStrategy(4, 'procurehub')).toBe(120000);
    expect(backoffStrategy(1, 'unsupported')).toBe(-1);
  });

  it('namespaces temporary values and gives them an expiry', async () => {
    await redisData.setTemporaryData('invoice-pdf', 'invoice-1', 'pdf-content', 3600);
    expect(redisClient.set).toHaveBeenCalledWith(
      'procurehub:temporary:invoice-pdf:invoice-1',
      'pdf-content',
      { EX: 3600 }
    );
    redisClient.get.mockResolvedValueOnce('pdf-content');
    await expect(redisData.getTemporaryData('invoice-pdf', 'invoice-1'))
      .resolves.toBe('pdf-content');
  });

  it('uses atomic Redis increments and rejects requests above the limit', async () => {
    redisClient.eval.mockResolvedValueOnce([3, 42]);
    const middleware = createRateLimit({ limit: 2, windowSeconds: 60 });
    const req = { ip: '192.0.2.1', socket: {} };
    const res = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await middleware(req, res, next);

    expect(redisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR'"),
      expect.objectContaining({
        keys: [expect.stringMatching(/^procurehub:rate-limit:/)],
        arguments: ['60'],
      })
    );
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' }),
    }));
    expect(next).not.toHaveBeenCalled();
  });
});
