const { query } = require('../config/db');
const { NotFoundError } = require('../utils/errors');

async function listUsers(filters) {
  const values = [];
  const conditions = ['u.deleted_at IS NULL'];
  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`(u.email ILIKE $${values.length}
      OR u.first_name ILIKE $${values.length}
      OR u.last_name ILIKE $${values.length}
      OR b.name ILIKE $${values.length})`);
  }
  if (filters.role) {
    values.push(filters.role);
    conditions.push(`EXISTS (
      SELECT 1 FROM user_roles filter_ur
      JOIN roles filter_r ON filter_r.id = filter_ur.role_id
      WHERE filter_ur.user_id = u.id AND filter_r.name = $${values.length}
    )`);
  }
  if (filters.active !== undefined) {
    values.push(filters.active);
    conditions.push(`u.is_active = $${values.length}`);
  }
  const where = conditions.join(' AND ');
  const count = await query(
    `SELECT COUNT(DISTINCT u.id)::INTEGER AS total
     FROM users u LEFT JOIN businesses b ON b.owner_user_id = u.id
     WHERE ${where}`,
    values
  );
  const limitIndex = values.length + 1;
  const result = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.is_active,
            u.is_verified, u.created_at, b.name AS business_name,
            COALESCE(ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::TEXT[]) AS roles
     FROM users u
     LEFT JOIN businesses b ON b.owner_user_id = u.id
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE ${where}
     GROUP BY u.id, b.name
     ORDER BY u.created_at DESC
     LIMIT $${limitIndex} OFFSET $${limitIndex + 1}`,
    [...values, filters.limit, (filters.page - 1) * filters.limit]
  );
  const total = count.rows[0].total;
  return { data: result.rows, page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) };
}

async function updateUserActive(userId, active, actorUserId) {
  if (userId === actorUserId && !active) {
    const { ConflictError } = require('../utils/errors');
    throw new ConflictError('You cannot deactivate your own account', 'CANNOT_DEACTIVATE_SELF');
  }
  const result = await query(
    `UPDATE users SET is_active = $1, updated_at = NOW()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING id, email, first_name, last_name, is_active`,
    [active, userId]
  );
  if (!result.rows[0]) throw new NotFoundError('User not found');
  return result.rows[0];
}

async function listSuppliers(filters) {
  const values = [];
  const conditions = ['u.is_active = TRUE', 'u.deleted_at IS NULL'];
  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`(b.name ILIKE $${values.length} OR u.email ILIKE $${values.length})`);
  }
  const where = conditions.join(' AND ');
  const count = await query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM supplier_profiles sp
     JOIN users u ON u.id = sp.user_id
     JOIN businesses b ON b.id = sp.business_id
     WHERE ${where}`,
    values
  );
  const result = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, b.name AS business_name,
            b.city, b.state, b.country, sp.verification_status, sp.rating_average,
            sp.rating_count, COUNT(DISTINCT supplier_products.id)::INTEGER AS product_count
     FROM supplier_profiles sp
     JOIN users u ON u.id = sp.user_id
     JOIN businesses b ON b.id = sp.business_id
     LEFT JOIN supplier_products ON supplier_products.supplier_user_id = sp.user_id
       AND supplier_products.is_active = TRUE
     WHERE ${where}
     GROUP BY u.id, b.id, sp.user_id
     ORDER BY b.name
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.limit, (filters.page - 1) * filters.limit]
  );
  const total = count.rows[0].total;
  return { data: result.rows, page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) };
}

async function updateSupplierVerification(userId, status) {
  const result = await query(
    `UPDATE supplier_profiles
     SET verification_status = $1, updated_at = NOW()
     WHERE user_id = $2
     RETURNING user_id, verification_status`,
    [status, userId]
  );
  if (!result.rows[0]) throw new NotFoundError('Supplier not found');
  return result.rows[0];
}

async function listOrders(filters) {
  const values = [];
  const conditions = ['TRUE'];
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`po.status = $${values.length}`);
  }
  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`(po.order_number ILIKE $${values.length}
      OR pr.title ILIKE $${values.length}
      OR buyer_business.name ILIKE $${values.length}
      OR supplier_business.name ILIKE $${values.length})`);
  }
  const from = `FROM purchase_orders po
     JOIN purchase_requests pr ON pr.id = po.purchase_request_id
     JOIN buyer_profiles bp ON bp.user_id = po.buyer_user_id
     JOIN businesses buyer_business ON buyer_business.id = bp.business_id
     JOIN supplier_profiles sp ON sp.user_id = po.supplier_user_id
     JOIN businesses supplier_business ON supplier_business.id = sp.business_id`;
  const where = conditions.join(' AND ');
  const count = await query(`SELECT COUNT(*)::INTEGER AS total ${from} WHERE ${where}`, values);
  const result = await query(
    `SELECT po.id, po.order_number, po.status, po.currency, po.subtotal, po.created_at,
            po.expected_delivery_date, pr.title AS request_title,
            buyer_business.name AS buyer_business_name,
            supplier_business.name AS supplier_business_name
     ${from}
     WHERE ${where}
     ORDER BY po.created_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.limit, (filters.page - 1) * filters.limit]
  );
  const total = count.rows[0].total;
  return { data: result.rows, page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) };
}

async function getOrder(id) {
  const header = await query(
    `SELECT po.*, pr.request_number, pr.title AS request_title,
            buyer_business.name AS buyer_business_name,
            supplier_business.name AS supplier_business_name
     FROM purchase_orders po
     JOIN purchase_requests pr ON pr.id = po.purchase_request_id
     JOIN buyer_profiles bp ON bp.user_id = po.buyer_user_id
     JOIN businesses buyer_business ON buyer_business.id = bp.business_id
     JOIN supplier_profiles sp ON sp.user_id = po.supplier_user_id
     JOIN businesses supplier_business ON supplier_business.id = sp.business_id
     WHERE po.id = $1`,
    [id]
  );
  if (!header.rows[0]) throw new NotFoundError('Purchase order not found');
  const [items, audit] = await Promise.all([
    query(
      `SELECT id, product_name, product_sku, quantity, unit_price, line_total
       FROM purchase_order_items WHERE purchase_order_id = $1 ORDER BY product_name, id`,
      [id]
    ),
    query(
      `SELECT id, from_status, to_status, actor_user_id, actor_role, reason, created_at
       FROM purchase_order_audit_logs WHERE purchase_order_id = $1 ORDER BY created_at, id`,
      [id]
    ),
  ]);
  return { ...header.rows[0], items: items.rows, audit: audit.rows };
}

async function listAuditLogs(filters) {
  const values = [];
  const conditions = ['TRUE'];
  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`(po.order_number ILIKE $${values.length} OR u.email ILIKE $${values.length}
      OR l.from_status ILIKE $${values.length} OR l.to_status ILIKE $${values.length})`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`l.to_status = $${values.length}`);
  }
  const from = `FROM purchase_order_audit_logs l
    JOIN purchase_orders po ON po.id = l.purchase_order_id
    JOIN users u ON u.id = l.actor_user_id`;
  const where = conditions.join(' AND ');
  const count = await query(`SELECT COUNT(*)::INTEGER AS total ${from} WHERE ${where}`, values);
  const result = await query(
    `SELECT l.id, l.purchase_order_id AS order_id, po.order_number,
            l.from_status, l.to_status, l.actor_user_id, u.email AS actor_email,
            l.actor_role, l.reason, l.created_at
     ${from}
     WHERE ${where}
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.limit, (filters.page - 1) * filters.limit]
  );
  const total = count.rows[0].total;
  return { data: result.rows, page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) };
}

async function getDashboard() {
  const result = await query(
    `SELECT
       (SELECT COUNT(*)::INTEGER FROM users WHERE deleted_at IS NULL) AS users,
       (SELECT COUNT(*)::INTEGER FROM supplier_profiles) AS suppliers,
       (SELECT COUNT(*)::INTEGER FROM purchase_requests WHERE status IN ('OPEN', 'QUOTATION_RECEIVED')) AS open_requests,
       (SELECT COUNT(*)::INTEGER FROM purchase_orders WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'REJECTED', 'REFUNDED')) AS active_orders,
       (SELECT COUNT(*)::INTEGER FROM invoices WHERE status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')) AS outstanding_invoices,
       (SELECT COALESCE(SUM(total), 0)::NUMERIC(14,2) FROM invoices WHERE status = 'PAID') AS paid_total`
  );
  return result.rows[0];
}

module.exports = {
  listUsers,
  updateUserActive,
  listSuppliers,
  updateSupplierVerification,
  listOrders,
  getOrder,
  listAuditLogs,
  getDashboard,
};
