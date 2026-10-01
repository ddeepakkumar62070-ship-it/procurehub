const { createHash } = require('crypto');
const { pool: defaultPool } = require('../config/db');
const { ConflictError } = require('../utils/errors');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function hashRequest(request) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(request)))
    .digest('hex');
}

async function executeIdempotently({
  userId,
  idempotencyKey,
  request,
  operation,
  pool = defaultPool,
}) {
  const requestHash = hashRequest(request);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO api_idempotency_keys (user_id, idempotency_key, request_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [userId, idempotencyKey, requestHash]
    );

    if (!inserted.rowCount) {
      const existingResult = await client.query(
        `SELECT request_hash, response, response_status, status
         FROM api_idempotency_keys
         WHERE user_id = $1 AND idempotency_key = $2
         FOR UPDATE`,
        [userId, idempotencyKey]
      );
      const existing = existingResult.rows[0];
      if (!existing) throw new Error('Idempotency key conflict row was not found');
      if (existing.request_hash !== requestHash) {
        throw new ConflictError(
          'Idempotency-Key was already used with a different request',
          'IDEMPOTENCY_KEY_REUSED'
        );
      }
      if (existing.status !== 'COMPLETED') {
        throw new ConflictError(
          'A request using this Idempotency-Key is still being processed',
          'IDEMPOTENCY_REQUEST_IN_PROGRESS'
        );
      }
      await client.query('COMMIT');
      return {
        body: existing.response,
        statusCode: existing.response_status,
        replayed: true,
      };
    }

    const result = await operation(client);
    await client.query(
      `UPDATE api_idempotency_keys
       SET response = $1, response_status = $2, status = 'COMPLETED', updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify(result.body), result.statusCode, inserted.rows[0].id]
    );
    await client.query('COMMIT');
    return { ...result, replayed: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  hashRequest,
  executeIdempotently,
};
