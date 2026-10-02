jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn() },
  query: jest.fn(),
}));
jest.mock('../src/services/adminAuditService', () => ({
  record: jest.fn(),
}));

const { pool } = require('../src/config/db');
const disputeService = require('../src/services/disputeService');
const adminAuditService = require('../src/services/adminAuditService');

const buyer = { id: 'buyer-id', roles: ['BUYER'] };
const orderId = 'order-id';
const disputeId = 'dispute-id';

function transactionClient(responses) {
  const calls = [];
  const client = {
    query: jest.fn(async (sql) => {
      calls.push(sql);
      const response = responses.shift();
      return response || { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  return { client, calls };
}

describe('dispute service transaction handling', () => {
  afterEach(() => jest.clearAllMocks());

  it('records a dispute and its opening audit entry in the same transaction', async () => {
    const dispute = { id: disputeId, order_id: orderId, status: 'OPEN' };
    const { client, calls } = transactionClient([
      { rows: [] },
      { rows: [{ id: orderId, buyer_user_id: buyer.id, supplier_user_id: 'supplier-id' }] },
      { rows: [dispute] },
      { rows: [], rowCount: 1 },
      { rows: [] },
    ]);

    await expect(disputeService.create(buyer, {
      orderId,
      type: 'ORDER_NOT_RECEIVED',
      title: 'Late shipment',
      description: 'The shipment has not moved for multiple days.',
    })).resolves.toEqual(dispute);

    expect(calls[0]).toBe('BEGIN');
    expect(calls[1]).toContain('FOR SHARE');
    expect(calls[2]).toContain('INSERT INTO order_disputes');
    expect(calls[3]).toContain('INSERT INTO order_dispute_audit_logs');
    expect(calls[4]).toBe('COMMIT');
    expect(adminAuditService.record).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back when the caller is not an order party', async () => {
    const { client, calls } = transactionClient([
      { rows: [] },
      { rows: [] },
      { rows: [] },
    ]);

    await expect(disputeService.create(buyer, {
      orderId,
      type: 'ORDER_NOT_RECEIVED',
      title: 'Late shipment',
      description: 'The shipment has not moved for multiple days.',
    })).rejects.toMatchObject({ statusCode: 404 });
    expect(calls).toEqual(['BEGIN', expect.stringContaining('FOR SHARE'), 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid status transitions before updating the dispute', async () => {
    const { client, calls } = transactionClient([
      { rows: [] },
      { rows: [{ id: disputeId, status: 'RESOLVED' }] },
      { rows: [] },
    ]);

    await expect(disputeService.updateStatus(
      { id: 'admin-id', roles: ['ADMIN'] },
      disputeId,
      { status: 'UNDER_REVIEW' }
    )).rejects.toMatchObject({ code: 'INVALID_DISPUTE_TRANSITION' });
    expect(calls).toEqual(['BEGIN', expect.stringContaining('FOR UPDATE'), 'ROLLBACK']);
    expect(adminAuditService.record).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('requires admin permission before starting a dispute update transaction', async () => {
    await expect(disputeService.updateStatus(
      buyer,
      disputeId,
      { status: 'UNDER_REVIEW' }
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('audits a valid admin status transition in the same transaction', async () => {
    const updated = { id: disputeId, order_id: orderId, status: 'UNDER_REVIEW' };
    const { client, calls } = transactionClient([
      { rows: [] },
      { rows: [{ id: disputeId, status: 'OPEN' }] },
      { rows: [updated] },
      { rows: [], rowCount: 1 },
      { rows: [] },
    ]);

    await expect(disputeService.updateStatus(
      { id: 'admin-id', roles: ['ADMIN'] },
      disputeId,
      { status: 'UNDER_REVIEW' }
    )).resolves.toEqual(updated);
    expect(adminAuditService.record).toHaveBeenCalledWith(client, {
      actorUserId: 'admin-id',
      action: 'DISPUTE_STATUS_UPDATED',
      entityType: 'DISPUTE',
      entityId: disputeId,
      before: { status: 'OPEN' },
      after: { status: 'UNDER_REVIEW' },
      reason: null,
    });
    expect(calls.at(-1)).toBe('COMMIT');
  });
});
