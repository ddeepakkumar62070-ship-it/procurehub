const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { pool } = require('../src/config/db');
const logger = require('../src/config/logger');

const adminInputSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).refine(
    (password) => Buffer.byteLength(password, 'utf8') <= 72,
    'Password must be no more than 72 UTF-8 bytes'
  ),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});

async function createAdmin() {
  const input = adminInputSchema.parse({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    firstName: process.env.ADMIN_FIRST_NAME,
    lastName: process.env.ADMIN_LAST_NAME,
  });
  const passwordHash = await bcrypt.hash(input.password, 12);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_verified)
       VALUES (LOWER($1), $2, $3, $4, TRUE)
       RETURNING id`,
      [input.email, passwordHash, input.firstName, input.lastName]
    );
    const roleResult = await client.query(
      "SELECT id FROM roles WHERE name = 'ADMIN'"
    );
    if (!roleResult.rows[0]) {
      throw new Error('ADMIN role is missing; apply database migrations first');
    }
    await client.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
      [userResult.rows[0].id, roleResult.rows[0].id]
    );
    await client.query('COMMIT');
    logger.info('Admin account created', { userId: userResult.rows[0].id });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      throw new Error('An account with this email already exists');
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createAdmin().catch((error) => {
  logger.error('Admin account creation failed', { error: error.message });
  process.exitCode = 1;
});
