const { Pool } = require('pg');
const { executeIdempotently } = require('../src/services/idempotencyService');

const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDatabase('API idempotency PostgreSQL integration', () => {
  let adminPool;
  let testPool;
  let schema;
  let userId;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    schema = `idempotency_test_${process.pid}_${Date.now()}`;
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    testPool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 6,
    });
    await testPool.query(`
      CREATE TABLE users (id UUID PRIMARY KEY);
      CREATE TABLE api_idempotency_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL,
        request_hash CHAR(64) NOT NULL,
        response JSONB,
        response_status SMALLINT,
        status TEXT NOT NULL DEFAULT 'PROCESSING',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, idempotency_key)
      );
      CREATE TABLE created_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        quotation_id UUID NOT NULL
      );
    `);
    userId = 'e6b98e7c-e369-40c7-a165-b3026a2cdab1';
    await testPool.query('INSERT INTO users (id) VALUES ($1)', [userId]);
  });

  beforeEach(async () => {
    await testPool.query('TRUNCATE api_idempotency_keys, created_orders');
  });

  afterAll(async () => {
    if (testPool) await testPool.end();
    if (adminPool && schema) {
      await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
      await adminPool.end();
    }
  });

  function execute({ key, request, quotationId = 'e6b98e7c-e369-40c7-a165-b3026a2cdab2', pause = false }) {
    return executeIdempotently({
      pool: testPool,
      userId,
      idempotencyKey: key,
      request,
      operation: async (client) => {
        if (pause) await client.query('SELECT pg_sleep(0.1)');
        const inserted = await client.query(
          'INSERT INTO created_orders (user_id, quotation_id) VALUES ($1, $2) RETURNING id',
          [userId, quotationId]
        );
        return {
          body: { success: true, data: { id: inserted.rows[0].id, quotationId } },
          statusCode: 201,
        };
      },
    });
  }

  it('stores and returns the result from the first request', async () => {
    const result = await execute({ key: 'first', request: { quotationId: 'quote-a' } });
    expect(result.replayed).toBe(false);
    expect(result.statusCode).toBe(201);
    expect(result.body.data.quotationId).toBe('e6b98e7c-e369-40c7-a165-b3026a2cdab2');
    const stored = await testPool.query(
      'SELECT status, response_status, response FROM api_idempotency_keys WHERE idempotency_key = $1',
      ['first']
    );
    expect(stored.rows[0]).toMatchObject({
      status: 'COMPLETED',
      response_status: 201,
    });
    expect(stored.rows[0].response).toEqual(result.body);
  });

  it('returns the stored response for a duplicate request without creating another order', async () => {
    const first = await execute({ key: 'duplicate', request: { quotationId: 'quote-a' } });
    const second = await execute({ key: 'duplicate', request: { quotationId: 'quote-a' } });
    expect(second).toMatchObject({
      body: first.body,
      statusCode: first.statusCode,
      replayed: true,
    });
    const count = await testPool.query('SELECT COUNT(*)::INTEGER AS count FROM created_orders');
    expect(count.rows[0].count).toBe(1);
  });

  it('rejects reuse of a key with a different request body', async () => {
    await execute({ key: 'body-conflict', request: { quotationId: 'quote-a' } });
    await expect(execute({
      key: 'body-conflict',
      request: { quotationId: 'quote-b' },
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', statusCode: 409 });
    const count = await testPool.query('SELECT COUNT(*)::INTEGER AS count FROM created_orders');
    expect(count.rows[0].count).toBe(1);
  });

  it('serializes concurrent duplicates and commits one order and one response', async () => {
    const request = { quotationId: 'quote-concurrent' };
    const results = await Promise.all([
      execute({ key: 'concurrent', request, pause: true }),
      execute({ key: 'concurrent', request, pause: true }),
    ]);
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(results[0].body).toEqual(results[1].body);
    const [orderCount, keyCount] = await Promise.all([
      testPool.query('SELECT COUNT(*)::INTEGER AS count FROM created_orders'),
      testPool.query('SELECT COUNT(*)::INTEGER AS count FROM api_idempotency_keys'),
    ]);
    expect(orderCount.rows[0].count).toBe(1);
    expect(keyCount.rows[0].count).toBe(1);
  });
});
