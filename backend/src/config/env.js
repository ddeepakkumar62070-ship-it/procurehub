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
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
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

if (env.nodeEnv === 'production') {
  for (const [name, value] of [
    ['JWT_SECRET', env.jwtSecret],
    ['JWT_REFRESH_SECRET', env.jwtRefreshSecret],
  ]) {
    if (value.length < 32 || value.includes('change_me')) {
      throw new Error(`${name} must be a strong, unique secret in production`);
    }
  }
}

module.exports = env;
