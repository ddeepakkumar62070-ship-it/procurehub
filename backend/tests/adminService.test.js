jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn() },
  query: jest.fn(),
}));
jest.mock('../src/services/adminAuditService', () => ({
  record: jest.fn(),
}));
jest.mock('../src/config/redisData', () => ({
  invalidateReadCache: jest.fn(),
}));
jest.mock('../src/config/socket', () => ({
  disconnectUser: jest.fn(),
}));

const { pool } = require('../src/config/db');
const adminAuditService = require('../src/services/adminAuditService');
const redisData = require('../src/config/redisData');
const socketService = require('../src/config/socket');
const adminService = require('../src/services/adminService');

const adminId = 'admin-id';
const entityId = 'entity-id';

function mockTransaction(responses) {
  const client = {
    query: jest.fn(async () => responses.shift() || { rows: [] }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return client;
}

describe('admin audit transactions', () => {
  afterEach(() => jest.clearAllMocks());

  it('audits user activation changes inside the same transaction', async () => {
    const before = { id: entityId, email: 'user@example.com', is_active: false };
    const after = { id: entityId, email: 'user@example.com', is_active: true };
    const client = mockTransaction([
      { rows: [] },
      { rows: [before] },
      { rows: [after] },
      { rows: [] },
    ]);

    await expect(adminService.updateUserActive(entityId, true, adminId)).resolves.toEqual(after);
    expect(adminAuditService.record).toHaveBeenCalledWith(client, {
      actorUserId: adminId,
      action: 'USER_ACTIVATED',
      entityType: 'USER',
      entityId,
      before: { isActive: false },
      after: { isActive: true },
    });
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      expect.stringContaining('FOR UPDATE'),
      expect.stringContaining('UPDATE users'),
      'COMMIT',
    ]);
  });

  it('revokes refresh tokens and disconnects sockets when deactivating a user', async () => {
    const before = { id: entityId, email: 'user@example.com', is_active: true };
    const after = { id: entityId, email: 'user@example.com', is_active: false };
    const client = mockTransaction([
      { rows: [] },
      { rows: [before] },
      { rows: [after] },
      { rows: [], rowCount: 2 },
      { rows: [] },
    ]);

    await expect(adminService.updateUserActive(entityId, false, adminId)).resolves.toEqual(after);

    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      expect.stringContaining('FOR UPDATE'),
      expect.stringContaining('UPDATE users'),
      expect.stringContaining('UPDATE refresh_tokens'),
      'COMMIT',
    ]);
    expect(socketService.disconnectUser).toHaveBeenCalledWith(entityId);
    expect(redisData.invalidateReadCache).toHaveBeenCalledTimes(1);
  });

  it('audits supplier suspension and invalidates marketplace caches', async () => {
    const before = { user_id: entityId, is_suspended: false, suspension_reason: null };
    const after = {
      user_id: entityId,
      is_suspended: true,
      suspension_reason: 'Repeated policy violations',
      suspended_at: '2026-10-02T00:00:00.000Z',
    };
    const client = mockTransaction([
      { rows: [] },
      { rows: [before] },
      { rows: [after] },
      { rows: [] },
    ]);

    await expect(adminService.updateSupplierSuspension(
      entityId,
      true,
      'Repeated policy violations',
      adminId
    )).resolves.toEqual(after);
    expect(adminAuditService.record).toHaveBeenCalledWith(client, expect.objectContaining({
      actorUserId: adminId,
      action: 'SUPPLIER_SUSPENDED',
      entityType: 'SUPPLIER',
      entityId,
      before: { isSuspended: false, reason: null },
      after: { isSuspended: true, reason: 'Repeated policy violations' },
    }));
    expect(redisData.invalidateReadCache).toHaveBeenCalledTimes(1);
  });

  it('invalidates marketplace caches after supplier verification changes', async () => {
    const before = {
      user_id: entityId,
      verification_status: 'PENDING',
      is_suspended: false,
    };
    const after = {
      user_id: entityId,
      verification_status: 'VERIFIED',
      is_suspended: false,
    };
    const client = mockTransaction([
      { rows: [] },
      { rows: [before] },
      { rows: [after] },
      { rows: [] },
    ]);

    await expect(adminService.updateSupplierVerification(entityId, 'VERIFIED', adminId))
      .resolves.toEqual(after);
    expect(adminAuditService.record).toHaveBeenCalledWith(client, expect.objectContaining({
      actorUserId: adminId,
      action: 'SUPPLIER_VERIFICATION_UPDATED',
      entityId,
    }));
    expect(redisData.invalidateReadCache).toHaveBeenCalledTimes(1);
  });

  it('writes category creation and its audit event atomically', async () => {
    const category = {
      id: entityId,
      parent_category_id: null,
      name: 'Office supplies',
      slug: 'office-supplies',
      description: null,
      is_active: true,
    };
    const client = mockTransaction([
      { rows: [] },
      { rows: [category] },
      { rows: [] },
    ]);

    await expect(adminService.createCategory({
      name: 'Office supplies',
      slug: 'office-supplies',
    }, adminId)).resolves.toEqual(category);
    expect(adminAuditService.record).toHaveBeenCalledWith(client, {
      actorUserId: adminId,
      action: 'CATEGORY_CREATED',
      entityType: 'CATEGORY',
      entityId,
      after: category,
    });
    expect(redisData.invalidateReadCache).toHaveBeenCalledTimes(1);
  });
});
