const { pool, query } = require('../config/db');
const { ConflictError, ForbiddenError, NotFoundError } = require('../utils/errors');
const adminAuditService = require('./adminAuditService');

const DISPUTE_TRANSITIONS = {
  OPEN: ['UNDER_REVIEW', 'RESOLVED', 'REJECTED'],
  UNDER_REVIEW: ['RESOLVED', 'REJECTED'],
  RESOLVED: [],
  REJECTED: [],
};

async function create(user, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await client.query(
      `SELECT id, buyer_user_id, supplier_user_id
       FROM purchase_orders
       WHERE id = $1 AND (buyer_user_id = $2 OR supplier_user_id = $2)
       FOR SHARE`,
      [input.orderId, user.id]
    );
    if (!order.rows[0]) throw new NotFoundError('Purchase order not found');
    const result = await client.query(
      `INSERT INTO order_disputes (order_id, opened_by, type, title, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, order_id, opened_by, type, title, description, status, created_at`,
      [input.orderId, user.id, input.type, input.title, input.description]
    );
    await client.query(
      `INSERT INTO order_dispute_audit_logs
         (dispute_id, actor_user_id, to_status, note)
       VALUES ($1, $2, 'OPEN', 'Dispute opened')`,
      [result.rows[0].id, user.id]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function list(user, filters, admin = false) {
  const values = [];
  const conditions = [];
  if (!admin) {
    values.push(user.id);
    conditions.push(`(d.opened_by = $${values.length}
      OR EXISTS (
        SELECT 1 FROM purchase_orders party_order
        WHERE party_order.id = d.order_id
          AND (party_order.buyer_user_id = $${values.length}
            OR party_order.supplier_user_id = $${values.length})
      ))`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`d.status = $${values.length}`);
  }
  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`(d.title ILIKE $${values.length} OR po.order_number ILIKE $${values.length})`);
  }
  const where = conditions.length ? conditions.join(' AND ') : 'TRUE';
  const from = `FROM order_disputes d
    JOIN purchase_orders po ON po.id = d.order_id
    JOIN users opener ON opener.id = d.opened_by`;
  const count = await query(`SELECT COUNT(*)::INTEGER AS total ${from} WHERE ${where}`, values);
  const result = await query(
    `SELECT d.id, d.order_id, po.order_number, d.opened_by,
            opener.email AS opened_by_email, d.type, d.title, d.description,
            d.status, d.resolution, d.resolved_by, d.resolved_at, d.created_at, d.updated_at
     ${from}
     WHERE ${where}
     ORDER BY d.created_at DESC, d.id DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.limit, (filters.page - 1) * filters.limit]
  );
  const total = count.rows[0].total;
  return { data: result.rows, page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) };
}

async function updateStatus(actor, id, input) {
  if (!actor.roles.includes('ADMIN')) {
    throw new ForbiddenError('Only admins can update dispute status');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT id, status FROM order_disputes WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const dispute = selected.rows[0];
    if (!dispute) throw new NotFoundError('Dispute not found');
    if (!DISPUTE_TRANSITIONS[dispute.status].includes(input.status)) {
      throw new ConflictError(
        `Cannot move a ${dispute.status} dispute to ${input.status}`,
        'INVALID_DISPUTE_TRANSITION'
      );
    }
    const result = await client.query(
      `UPDATE order_disputes
       SET status = $1, resolution = $2,
           resolved_by = CASE WHEN $1 IN ('RESOLVED', 'REJECTED') THEN $3 ELSE NULL END,
           resolved_at = CASE WHEN $1 IN ('RESOLVED', 'REJECTED') THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, order_id, opened_by, type, title, description, status,
                 resolution, resolved_by, resolved_at, created_at, updated_at`,
      [input.status, input.resolution || null, actor.id, id]
    );
    await client.query(
      `INSERT INTO order_dispute_audit_logs
         (dispute_id, actor_user_id, from_status, to_status, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, actor.id, dispute.status, input.status, input.resolution || null]
    );
    await adminAuditService.record(client, {
      actorUserId: actor.id,
      action: 'DISPUTE_STATUS_UPDATED',
      entityType: 'DISPUTE',
      entityId: id,
      before: { status: dispute.status },
      after: { status: input.status },
      reason: input.resolution || null,
    });
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { create, list, updateStatus };
