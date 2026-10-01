const { Pool } = require('pg');
const env = require('./env');
const logger = require('./logger');

const pool = new Pool({
  host: env.dbHost,
  port: env.dbPort,
  database: env.dbName,
  user: env.dbUser,
  password: env.dbPassword,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  logger.info('Connected to PostgreSQL');
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL client error', { error: err.message });
});

async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result;
}

module.exports = {
  pool,
  query,
};
