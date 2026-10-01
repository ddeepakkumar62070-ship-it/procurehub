const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool, query } = require('../config/db');
const env = require('../config/env');
const {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} = require('../utils/errors');

const BCRYPT_ROUNDS = 12;

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id },
    env.jwtSecret,
    { algorithm: 'HS256', expiresIn: env.accessTokenExpiresIn }
  );
}

function getPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    roles: user.roles,
  };
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getUserRoles(client, userId) {
  const result = await client.query(
    `SELECT r.name
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1
     ORDER BY r.name`,
    [userId]
  );
  return result.rows.map((row) => row.name);
}

async function insertRefreshToken(client, userId) {
  const token = crypto.randomBytes(48).toString('base64url');
  const tokenHash = hashRefreshToken(token);
  const expiresAt = new Date(
    Date.now() + env.refreshTokenExpiresInDays * 24 * 60 * 60 * 1000
  );
  await client.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
  return { token, tokenHash, expiresAt };
}

function createAuthResult(user, refreshToken) {
  return {
    accessToken: signAccessToken(user),
    user: getPublicUser(user),
    refreshToken: refreshToken.token,
    refreshTokenExpiresAt: refreshToken.expiresAt,
  };
}

async function register(input) {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  try {
    return await withTransaction(async (client) => {
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name)
         VALUES (LOWER($1), $2, $3, $4)
         RETURNING id, email, first_name, last_name`,
        [input.email, passwordHash, input.firstName, input.lastName]
      );
      const user = userResult.rows[0];

      const roleResult = await client.query(
        'SELECT id FROM roles WHERE name = $1',
        [input.role]
      );
      if (!roleResult.rows[0]) {
        throw new Error(`Required role ${input.role} is missing; apply the auth migration`);
      }

      await client.query(
        'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
        [user.id, roleResult.rows[0].id]
      );

      const businessResult = await client.query(
        `INSERT INTO businesses (owner_user_id, name)
         VALUES ($1, $2)
         RETURNING id`,
        [user.id, input.businessName]
      );
      if (input.role === 'BUYER') {
        await client.query(
          'INSERT INTO buyer_profiles (user_id, business_id) VALUES ($1, $2)',
          [user.id, businessResult.rows[0].id]
        );
      } else {
        await client.query(
          'INSERT INTO supplier_profiles (user_id, business_id) VALUES ($1, $2)',
          [user.id, businessResult.rows[0].id]
        );
      }

      user.roles = [input.role];
      const refreshToken = await insertRefreshToken(client, user.id);
      return createAuthResult(user, refreshToken);
    });
  } catch (error) {
    if (error.code === '23505') {
      throw new ConflictError('An account with this email already exists', 'EMAIL_ALREADY_EXISTS');
    }
    throw error;
  }
}

async function login(email, password) {
  const result = await query(
    `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.is_active
     FROM users u
     WHERE LOWER(u.email) = LOWER($1) AND u.deleted_at IS NULL`,
    [email]
  );
  const user = result.rows[0];
  if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
    throw new UnauthorizedError('Invalid email or password');
  }

  return withTransaction(async (client) => {
    const roles = await getUserRoles(client, user.id);
    if (roles.length === 0) {
      throw new ForbiddenError('This account has no assigned role');
    }
    await client.query(
      'UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1',
      [user.id]
    );
    const refreshToken = await insertRefreshToken(client, user.id);
    user.roles = roles;
    return createAuthResult(user, refreshToken);
  });
}

async function refresh(token) {
  if (!token) throw new UnauthorizedError('A refresh token is required');
  const tokenHash = hashRefreshToken(token);

  return withTransaction(async (client) => {
    const tokenResult = await client.query(
      `SELECT rt.id, rt.user_id, rt.expires_at, u.email, u.first_name, u.last_name
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
         AND rt.revoked_at IS NULL
         AND rt.expires_at > NOW()
         AND u.is_active = TRUE
         AND u.deleted_at IS NULL
       FOR UPDATE OF rt`,
      [tokenHash]
    );
    const existing = tokenResult.rows[0];
    if (!existing) throw new UnauthorizedError('Invalid or expired refresh token');

    const revokeResult = await client.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE id = $1 AND revoked_at IS NULL`,
      [existing.id]
    );
    if (revokeResult.rowCount !== 1) {
      throw new UnauthorizedError('Refresh token has already been used');
    }

    const roles = await getUserRoles(client, existing.user_id);
    if (roles.length === 0) {
      throw new ForbiddenError('This account has no assigned role');
    }
    const user = {
      id: existing.user_id,
      email: existing.email,
      first_name: existing.first_name,
      last_name: existing.last_name,
      roles,
    };
    const nextRefreshToken = await insertRefreshToken(client, user.id);
    return createAuthResult(user, nextRefreshToken);
  });
}

async function logout(token) {
  if (!token) return;
  await query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashRefreshToken(token)]
  );
}

async function getActiveUser(userId) {
  const result = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.is_active,
            COALESCE(
              ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL),
              ARRAY[]::TEXT[]
            ) AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.id = $1 AND u.is_active = TRUE AND u.deleted_at IS NULL
     GROUP BY u.id`,
    [userId]
  );
  if (!result.rows[0]) throw new UnauthorizedError('Account is unavailable');
  return result.rows[0];
}

async function getProfile(userId) {
  const result = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.is_verified,
            COALESCE(
              ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL),
              ARRAY[]::TEXT[]
            ) AS roles,
            b.id AS business_id, b.name AS business_name,
            b.registration_number, b.tax_id, b.address, b.city, b.state, b.country,
            bp.preferred_currency,
            sp.verification_status, sp.lead_time_days
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     LEFT JOIN businesses b ON b.owner_user_id = u.id
     LEFT JOIN buyer_profiles bp ON bp.user_id = u.id
     LEFT JOIN supplier_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1 AND u.is_active = TRUE AND u.deleted_at IS NULL
     GROUP BY u.id, b.id, bp.user_id, sp.user_id`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Profile not found');

  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    isVerified: row.is_verified,
    roles: row.roles,
    business: row.business_id ? {
      id: row.business_id,
      name: row.business_name,
      registrationNumber: row.registration_number,
      taxId: row.tax_id,
      address: row.address,
      city: row.city,
      state: row.state,
      country: row.country,
    } : null,
    buyerProfile: row.preferred_currency ? {
      preferredCurrency: row.preferred_currency,
    } : null,
    supplierProfile: row.verification_status ? {
      verificationStatus: row.verification_status,
      leadTimeDays: row.lead_time_days,
    } : null,
  };
}

async function updateProfile(user, changes) {
  const allowed = new Set([
    'firstName', 'lastName', 'phone', 'businessName', 'registrationNumber',
    'taxId', 'address', 'city', 'state', 'country',
    ...(user.roles.includes('BUYER') ? ['preferredCurrency'] : []),
    ...(user.roles.includes('SUPPLIER') ? ['leadTimeDays'] : []),
  ]);
  const disallowed = Object.keys(changes).filter((key) => !allowed.has(key));
  if (disallowed.length) {
    throw new ValidationError('One or more fields are not editable for this role', disallowed);
  }

  await withTransaction(async (client) => {
    const userFields = {
      firstName: 'first_name',
      lastName: 'last_name',
      phone: 'phone',
    };
    const businessFields = {
      businessName: 'name',
      registrationNumber: 'registration_number',
      taxId: 'tax_id',
      address: 'address',
      city: 'city',
      state: 'state',
      country: 'country',
    };

    for (const [key, column] of Object.entries(userFields)) {
      if (Object.hasOwn(changes, key)) {
        await client.query(
          `UPDATE users SET ${column} = $1, updated_at = NOW() WHERE id = $2`,
          [changes[key], user.id]
        );
      }
    }

    const businessEntries = Object.entries(businessFields)
      .filter(([key]) => Object.hasOwn(changes, key));
    if (businessEntries.length) {
      const values = businessEntries.map(([key]) => changes[key]);
      const assignments = businessEntries.map(
        ([, column], index) => `${column} = $${index + 1}`
      );
      values.push(user.id);
      await client.query(
        `UPDATE businesses SET ${assignments.join(', ')}, updated_at = NOW()
         WHERE owner_user_id = $${values.length}`,
        values
      );
    }

    if (Object.hasOwn(changes, 'preferredCurrency')) {
      await client.query(
        'UPDATE buyer_profiles SET preferred_currency = $1, updated_at = NOW() WHERE user_id = $2',
        [changes.preferredCurrency, user.id]
      );
    }
    if (Object.hasOwn(changes, 'leadTimeDays')) {
      await client.query(
        'UPDATE supplier_profiles SET lead_time_days = $1, updated_at = NOW() WHERE user_id = $2',
        [changes.leadTimeDays, user.id]
      );
    }
  });

  return getProfile(user.id);
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getActiveUser,
  getProfile,
  updateProfile,
};
