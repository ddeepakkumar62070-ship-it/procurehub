const fs = require('fs/promises');
const path = require('path');
const { pool } = require('../src/config/db');
const logger = require('../src/config/logger');

async function migrate() {
  const migrationsDirectory = path.resolve(__dirname, '../migrations');
  const files = (await fs.readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const file of files) {
      const existing = await client.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [file]
      );
      if (existing.rowCount > 0) continue;

      const sql = await fs.readFile(path.join(migrationsDirectory, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      logger.info(`Applied database migration ${file}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  logger.error('Database migration failed', { error: error.message });
  process.exitCode = 1;
});
