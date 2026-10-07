const env = require('../config/env');

const requestCounts = new Map();
let nextCleanupAt = 0;

function createRateLimit({ limit = env.rateLimitMax, windowSeconds = env.rateLimitWindowSeconds } = {}) {
  return function rateLimit(req, res, next) {
    const now = Date.now();
    const windowMilliseconds = windowSeconds * 1000;
    if (now >= nextCleanupAt) {
      for (const [key, bucket] of requestCounts) {
        if (bucket.resetAt <= now) requestCounts.delete(key);
      }
      nextCleanupAt = now + 60_000;
    }

    const identifier = req.ip || req.socket.remoteAddress || 'unknown';
    const window = Math.floor(now / windowMilliseconds);
    const resetAt = (window + 1) * windowMilliseconds;
    const key = `${windowMilliseconds}:${window}:${identifier}`;
    const count = (requestCounts.get(key)?.count || 0) + 1;
    requestCounts.set(key, { count, resetAt });

    res.set('RateLimit-Limit', String(limit));
    res.set('RateLimit-Remaining', String(Math.max(0, limit - count)));
    res.set('RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
    if (count > limit) {
      return res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests; try again later' },
      });
    }
    return next();
  };
}

module.exports = createRateLimit;
