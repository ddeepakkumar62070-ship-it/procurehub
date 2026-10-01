const { pool, query } = require('../config/db');
const jobOutboxService = require('./jobOutboxService');
const { NotFoundError } = require('../utils/errors');
const { QUEUE_NAMES } = require('../queues/queueRegistry');

const NOTIFICATION_TYPES = [
  'NEW_PURCHASE_REQUEST',
  'NEW_QUOTATION',
  'QUOTATION_ACCEPTED',
  'QUOTATION_REJECTED',
  'ORDER_CONFIRMED',
  'ORDER_SHIPPED',
  'ORDER_DELIVERED',
  'PAYMENT_RECEIVED',
  'QUOTATION_EXPIRING',
  'LOW_STOCK',
];

async function createInTransaction(client, {
  userId,
  type,
  title,
  message,
  data = {},
  dedupeKey,
}) {
  if (!NOTIFICATION_TYPES.includes(type)) {
    throw new Error(`Unsupported notification type: ${type}`);
  }
  const result = await client.query(
    `INSERT INTO notifications (user_id, type, title, message, data, dedupe_key)
     VALUES ($1, $2, $3, $4, $5::JSONB, $6)
     ON CONFLICT (user_id, dedupe_key) DO NOTHING
     RETURNING id, user_id, type, title, message, data, read_at, created_at`,
    [userId, type, title, message, JSON.stringify(data), dedupeKey || null]
  );
  if (!result.rows[0]) return null;
  const notification = result.rows[0];
  await jobOutboxService.addJob(client, {
    queueName: QUEUE_NAMES.notificationDelivery,
    jobName: 'deliver-notification',
    jobId: `notification-${notification.id}`,
    payload: { notificationId: notification.id },
  });
  return notification;
}

async function createManyInTransaction(client, input) {
  const created = [];
  for (const notification of input) {
    const result = await createInTransaction(client, notification);
    if (result) created.push(result);
  }
  return created;
}

async function deliver(notificationId) {
  const result = await query(
    `SELECT id, user_id, type, title, message, data, read_at, created_at
     FROM notifications WHERE id = $1`,
    [notificationId]
  );
  const notification = result.rows[0];
  if (!notification) throw new NotFoundError('Notification not found');
  const { getIo } = require('../config/socket');
  const io = getIo();
  if (!io) throw new Error('Socket.IO has not been initialized');
  io.to(`user:${notification.user_id}`).emit('notification:new', notification);
  return notification;
}

async function listForUser(userId, { page, limit, unreadOnly }) {
  const values = [userId];
  const unreadClause = unreadOnly ? 'AND read_at IS NULL' : '';
  const count = await query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM notifications WHERE user_id = $1 ${unreadClause}`,
    values
  );
  const offset = (page - 1) * limit;
  const result = await query(
    `SELECT id, type, title, message, data, read_at, created_at
     FROM notifications
     WHERE user_id = $1 ${unreadClause}
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return {
    data: result.rows,
    page,
    limit,
    total: count.rows[0].total,
    totalPages: Math.ceil(count.rows[0].total / limit),
  };
}

async function markRead(userId, notificationId) {
  const result = await query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING id, type, title, message, data, read_at, created_at`,
    [notificationId, userId]
  );
  if (!result.rows[0]) throw new NotFoundError('Notification not found');
  return result.rows[0];
}

async function markAllRead(userId) {
  const result = await query(
    `UPDATE notifications SET read_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return { updated: result.rowCount };
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

module.exports = {
  NOTIFICATION_TYPES,
  createInTransaction,
  createManyInTransaction,
  deliver,
  listForUser,
  markRead,
  markAllRead,
  withTransaction,
};
