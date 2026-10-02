const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function setupTestDatabase() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Set TEST_DATABASE_URL to a dedicated PostgreSQL test database');
  }

  const databaseName = decodeURIComponent(new URL(connectionString).pathname.slice(1));
  if (!/(^|[_-])test([_-]|$)/i.test(databaseName)) {
    throw new Error('Refusing to run migrations: TEST_DATABASE_URL database name must include a separate "test" segment');
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const directory = path.resolve(__dirname, '../migrations');
    const migrations = (await fs.readdir(directory))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const migration of migrations) {
      const applied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [migration]
      );
      if (applied.rowCount) continue;

      const sql = await fs.readFile(path.join(directory, migration), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (name) VALUES ($1)',
          [migration]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      process.stdout.write(`Applied ${migration}\n`);
    }
    process.stdout.write(`Test database ${databaseName} is migrated.\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

setupTestDatabase().catch((error) => {
  process.stderr.write(`Test database setup failed: ${error.message}\n`);
  process.exitCode = 1;
});
