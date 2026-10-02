const bcrypt = require('bcryptjs');
const authService = require('../src/services/authService');
const { query, pool } = require('../src/config/db');

const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDatabase('Authentication PostgreSQL integration', () => {
  const emails = [];

  afterEach(async () => {
    if (!emails.length) return;
    const users = await query('SELECT id FROM users WHERE email = ANY($1::TEXT[])', [emails]);
    const userIds = users.rows.map((user) => user.id);
    if (userIds.length) {
      await query('DELETE FROM refresh_tokens WHERE user_id = ANY($1::UUID[])', [userIds]);
      await query('DELETE FROM buyer_profiles WHERE user_id = ANY($1::UUID[])', [userIds]);
      await query('DELETE FROM businesses WHERE owner_user_id = ANY($1::UUID[])', [userIds]);
      await query('DELETE FROM user_roles WHERE user_id = ANY($1::UUID[])', [userIds]);
      await query('DELETE FROM users WHERE id = ANY($1::UUID[])', [userIds]);
    }
    emails.length = 0;
  });

  it('hashes passwords and rotates one-time refresh tokens', async () => {
    const email = `auth-${process.pid}-${Date.now()}@test.invalid`;
    emails.push(email);
    const password = 'integration-test-password-15';
    const registered = await authService.register({
      email,
      firstName: 'Test',
      lastName: 'Buyer',
      password,
      role: 'BUYER',
      businessName: 'Integration Buyer',
    });
    const saved = await query('SELECT password_hash FROM users WHERE email = $1', [email]);
    expect(saved.rows[0].password_hash).not.toBe(password);
    await expect(bcrypt.compare(password, saved.rows[0].password_hash)).resolves.toBe(true);

    const loggedIn = await authService.login(email, password);
    expect(loggedIn.accessToken).toBeTruthy();
    await expect(authService.login(email, 'incorrect-password'))
      .rejects.toMatchObject({ statusCode: 401 });

    const refreshed = await authService.refresh(registered.refreshToken);
    expect(refreshed.refreshToken).not.toBe(registered.refreshToken);
    await expect(authService.refresh(registered.refreshToken))
      .rejects.toMatchObject({ statusCode: 401 });
    await authService.logout(refreshed.refreshToken);
    await expect(authService.refresh(refreshed.refreshToken))
      .rejects.toMatchObject({ statusCode: 401 });
  });
});

afterAll(async () => {
  if (process.env.TEST_DATABASE_URL) await pool.end();
});
