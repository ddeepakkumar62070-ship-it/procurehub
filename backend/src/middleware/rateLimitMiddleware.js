const { redisClient } = require('../config/redis');
const env = require('../config/env');

const incrementWindowScript = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return { count, redis.call('TTL', KEYS[1]) }
`;

function createRateLimit({ limit = env.rateLimitMax, windowSeconds = env.rateLimitWindowSeconds } = {}) {
  return async function rateLimit(req, res, next) {
    if (env.nodeEnv === 'test' && !redisClient.isOpen) return next();
    if (!redisClient.isOpen) {
      const error = new Error('Redis is unavailable for API rate limiting');
      error.statusCode = 503;
      error.code = 'RATE_LIMITER_UNAVAILABLE';
      return next(error);
    }

    const identifier = req.ip || req.socket.remoteAddress || 'unknown';
    const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
    const key = `procurehub:rate-limit:${bucket}:${identifier}`;
    try {
      const [count, ttl] = await redisClient.eval(incrementWindowScript, {
        keys: [key],
        arguments: [String(windowSeconds)],
      });
      res.set('RateLimit-Limit', String(limit));
      res.set('RateLimit-Remaining', String(Math.max(0, limit - Number(count))));
      res.set('RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + Number(ttl)));
      if (Number(count) > limit) {
        return res.status(429).json({
          success: false,
          error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests; try again later' },
        });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = createRateLimit;
