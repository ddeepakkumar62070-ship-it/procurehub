const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: Number(process.env.DB_PORT || 5432),
  dbName: process.env.DB_NAME || 'procurehub',
  dbUser: process.env.DB_USER || 'postgres',
  dbPassword: process.env.DB_PASSWORD || 'postgres',
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: Number(process.env.REDIS_PORT || 6379),
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || 60),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 120),
  rateLimitWindowSeconds: Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 60),
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_me',
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
  refreshTokenExpiresInDays: Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS || 7),
  orderReservationTtlHours: Number(process.env.ORDER_RESERVATION_TTL_HOURS || 24),
  refreshCookieName: process.env.REFRESH_COOKIE_NAME || 'procurehub_refresh',
  logLevel: process.env.LOG_LEVEL || 'info',
};

if (!Number.isFinite(env.orderReservationTtlHours) || env.orderReservationTtlHours <= 0) {
  throw new Error('ORDER_RESERVATION_TTL_HOURS must be a positive number');
}
if (!Number.isFinite(env.cacheTtlSeconds) || env.cacheTtlSeconds <= 0) {
  throw new Error('CACHE_TTL_SECONDS must be a positive number');
}
if (!Number.isInteger(env.rateLimitMax) || env.rateLimitMax <= 0
  || !Number.isInteger(env.rateLimitWindowSeconds) || env.rateLimitWindowSeconds <= 0) {
  throw new Error('Rate limit settings must be positive integers');
}

if (env.nodeEnv === 'production') {
  for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    if (!process.env[name]) {
      throw new Error(`${name} must be configured in production`);
    }
  }
  for (const [name, value] of [
    ['JWT_SECRET', env.jwtSecret],
    ['JWT_REFRESH_SECRET', env.jwtRefreshSecret],
  ]) {
    if (value.length < 32 || new Set(value).size < 8 || /change_me/i.test(value)) {
      throw new Error(`${name} must be a strong, unique secret in production`);
    }
  }
  if (env.jwtSecret === env.jwtRefreshSecret) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }
  if (!env.corsOrigins.length || env.corsOrigins.some((origin) => {
    try {
      const parsed = new URL(origin);
      return parsed.origin !== origin || parsed.protocol !== 'https:';
    } catch {
      return true;
    }
  })) {
    throw new Error('CORS_ORIGIN must contain HTTPS origins without paths in production');
  }
}

module.exports = env;
