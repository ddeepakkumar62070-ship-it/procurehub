const { pool, query } = require('../config/db');
const { ConflictError, NotFoundError, ValidationError } = require('../utils/errors');
const adminAuditService = require('./adminAuditService');
const redisData = require('../config/redisData');

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
    throw new ConflictError('You cannot deactivate your own account', 'CANNOT_DEACTIVATE_SELF');
  }
  const user = await withTransaction(async (client) => {
    const selected = await client.query(
      `SELECT id, email, first_name, last_name, is_active
       FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [userId]
    );
    const before = selected.rows[0];
    if (!before) throw new NotFoundError('User not found');
    const updated = await client.query(
      `UPDATE users SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, first_name, last_name, is_active`,
      [active, userId]
    );
    const after = updated.rows[0];
    await adminAuditService.record(client, {
      actorUserId,
      action: active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entityType: 'USER',
      entityId: userId,
      before: { isActive: before.is_active },
      after: { isActive: after.is_active },
    });
    return after;
  });
  await redisData.invalidateReadCache();
  return user;
}

async function listSuppliers(filters) {
  const values = [];
  const conditions = ['u.deleted_at IS NULL'];
  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`(b.name ILIKE $${values.length} OR u.email ILIKE $${values.length})`);
  }
  if (filters.suspended !== undefined) {
    values.push(filters.suspended);
    conditions.push(`sp.is_suspended = $${values.length}`);
  }
  if (filters.verificationStatus) {
    values.push(filters.verificationStatus);
    conditions.push(`sp.verification_status = $${values.length}`);
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
    `    SELECT u.id, u.email, u.first_name, u.last_name, u.is_active,
           b.name AS business_name, b.city, b.state, b.country,
           sp.verification_status, sp.is_suspended, sp.suspension_reason,
           sp.suspended_at, sp.rating_average,
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

async function updateSupplierVerification(userId, status, actorUserId) {
  return withTransaction(async (client) => {
    const selected = await client.query(
      `SELECT user_id, verification_status, is_suspended
       FROM supplier_profiles WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    const before = selected.rows[0];
    if (!before) throw new NotFoundError('Supplier not found');
    const result = await client.query(
      `UPDATE supplier_profiles SET verification_status = $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING user_id, verification_status, is_suspended`,
      [status, userId]
    );
    const after = result.rows[0];
    await adminAuditService.record(client, {
      actorUserId,
      action: 'SUPPLIER_VERIFICATION_UPDATED',
      entityType: 'SUPPLIER',
      entityId: userId,
      before: { verificationStatus: before.verification_status },
      after: { verificationStatus: after.verification_status },
    });
    return after;
  });
}

async function updateSupplierSuspension(userId, isSuspended, reason, actorUserId) {
  const supplier = await withTransaction(async (client) => {
    const selected = await client.query(
      `SELECT user_id, is_suspended, suspension_reason
       FROM supplier_profiles WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    const before = selected.rows[0];
    if (!before) throw new NotFoundError('Supplier not found');
    if (isSuspended && !reason) {
      throw new ValidationError('A reason is required when suspending a supplier');
    }
    const result = await client.query(
      `UPDATE supplier_profiles
       SET is_suspended = $1,
           suspension_reason = CASE WHEN $1 THEN $2 ELSE NULL END,
           suspended_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE user_id = $3
       RETURNING user_id, is_suspended, suspension_reason, suspended_at`,
      [isSuspended, reason || null, userId]
    );
    const after = result.rows[0];
    await adminAuditService.record(client, {
      actorUserId,
      action: isSuspended ? 'SUPPLIER_SUSPENDED' : 'SUPPLIER_REINSTATED',
      entityType: 'SUPPLIER',
      entityId: userId,
      before: { isSuspended: before.is_suspended, reason: before.suspension_reason },
      after: { isSuspended: after.is_suspended, reason: after.suspension_reason },
      reason: reason || null,
    });
    return after;
  });
  require('../config/socket').disconnectUser(userId);
  await redisData.invalidateReadCache();
  return supplier;
}

async function listCategories() {
  const result = await query(
    `SELECT c.id, c.parent_category_id, c.name, c.slug, c.description,
            c.is_active, c.created_at, COUNT(p.id)::INTEGER AS product_count
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id AND p.deleted_at IS NULL
     GROUP BY c.id
     ORDER BY c.name`
  );
  return result.rows;
}

async function createCategory(input, actorUserId) {
  try {
    const category = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO categories (parent_category_id, name, slug, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id, parent_category_id, name, slug, description, is_active`,
        [input.parentCategoryId || null, input.name, input.slug, input.description || null]
      );
      const category = inserted.rows[0];
      await adminAuditService.record(client, {
        actorUserId,
        action: 'CATEGORY_CREATED',
        entityType: 'CATEGORY',
        entityId: category.id,
        after: category,
      });
      return category;
    });
    await redisData.invalidateReadCache();
    return category;
  } catch (error) {
    if (error.code === '23505') throw new ConflictError('A category with this slug already exists', 'CATALOG_ITEM_ALREADY_EXISTS');
    if (error.code === '23503') throw new ValidationError('Parent category does not exist');
    throw error;
  }
}

async function updateCategory(id, input, actorUserId) {
  const fields = {
    parentCategoryId: 'parent_category_id',
    name: 'name',
    slug: 'slug',
    description: 'description',
  };
  const entries = Object.entries(input);
  if (!entries.length) throw new ValidationError('At least one category field must be provided');
  const values = entries.map(([, value]) => value ?? null);
  const assignments = entries.map(([key], index) => `${fields[key]} = $${index + 1}`);
  values.push(id);
  try {
    const category = await withTransaction(async (client) => {
      const selected = await client.query(
        `SELECT id, parent_category_id, name, slug, description, is_active
         FROM categories WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id]
      );
      const before = selected.rows[0];
      if (!before) throw new NotFoundError('Category not found');
      const updated = await client.query(
        `UPDATE categories SET ${assignments.join(', ')}, updated_at = NOW()
         WHERE id = $${values.length}
         RETURNING id, parent_category_id, name, slug, description, is_active`,
        values
      );
      const after = updated.rows[0];
      await adminAuditService.record(client, {
        actorUserId,
        action: 'CATEGORY_UPDATED',
        entityType: 'CATEGORY',
        entityId: id,
        before,
        after,
      });
      return after;
    });
    await redisData.invalidateReadCache();
    return category;
  } catch (error) {
    if (error.code === '23505') throw new ConflictError('A category with this slug already exists', 'CATALOG_ITEM_ALREADY_EXISTS');
    if (error.code === '23503') throw new ValidationError('Parent category does not exist');
    throw error;
  }
}

async function deactivateCategory(id, actorUserId) {
  const category = await withTransaction(async (client) => {
    const selected = await client.query(
      `SELECT id, name, slug, is_active
       FROM categories WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    const before = selected.rows[0];
    if (!before) throw new NotFoundError('Category not found');
    const result = await client.query(
      `UPDATE categories SET is_active = FALSE, deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING id, name, slug, is_active`,
      [id]
    );
    await adminAuditService.record(client, {
      actorUserId,
      action: 'CATEGORY_DEACTIVATED',
      entityType: 'CATEGORY',
      entityId: id,
      before,
      after: result.rows[0],
    });
    return { id, deactivated: true };
  });
  await redisData.invalidateReadCache();
  return category;
}

async function createProduct(input, actorUserId) {
  try {
    const product = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO products (category_id, name, sku, description)
         SELECT id, $2, $3, $4
         FROM categories
         WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL
         RETURNING id, category_id, name, sku, description, is_active`,
        [input.categoryId, input.name, input.sku, input.description || null]
      );
      if (!result.rows[0]) throw new ValidationError('An active category is required');
      const created = result.rows[0];
      await adminAuditService.record(client, {
        actorUserId,
        action: 'PRODUCT_CREATED',
        entityType: 'PRODUCT',
        entityId: created.id,
        after: created,
      });
      return created;
    });
    await redisData.invalidateReadCache();
    return product;
  } catch (error) {
    if (error.code === '23505') throw new ConflictError('A product with this SKU already exists', 'CATALOG_ITEM_ALREADY_EXISTS');
    if (error.code === '23503') throw new ValidationError('A referenced category does not exist');
    throw error;
  }
}

async function updateProduct(id, input, actorUserId) {
  const fields = {
    categoryId: 'category_id',
    name: 'name',
    sku: 'sku',
    description: 'description',
  };
  const entries = Object.entries(input);
  if (!entries.length) throw new ValidationError('At least one product field must be provided');
  const assignments = entries.map(([key], index) => `${fields[key]} = $${index + 1}`);
  const values = entries.map(([, value]) => value ?? null);
  values.push(id);
  try {
    const product = await withTransaction(async (client) => {
      const selected = await client.query(
        `SELECT id, category_id, name, sku, description, is_active
         FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id]
      );
      const before = selected.rows[0];
      if (!before) throw new NotFoundError('Product not found');
      if (input.categoryId) {
        const category = await client.query(
          `SELECT id FROM categories WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
          [input.categoryId]
        );
        if (!category.rows[0]) throw new ValidationError('An active category is required');
      }
      const updated = await client.query(
        `UPDATE products SET ${assignments.join(', ')}, updated_at = NOW()
         WHERE id = $${values.length}
         RETURNING id, category_id, name, sku, description, is_active`,
        values
      );
      const after = updated.rows[0];
      await adminAuditService.record(client, {
        actorUserId,
        action: 'PRODUCT_UPDATED',
        entityType: 'PRODUCT',
        entityId: id,
        before,
        after,
      });
      return after;
    });
    await redisData.invalidateReadCache();
    return product;
  } catch (error) {
    if (error.code === '23505') throw new ConflictError('A product with this SKU already exists', 'CATALOG_ITEM_ALREADY_EXISTS');
    if (error.code === '23503') throw new ValidationError('A referenced category does not exist');
    throw error;
  }
}

async function deactivateProduct(id, actorUserId) {
  const product = await withTransaction(async (client) => {
    const selected = await client.query(
      `SELECT id, category_id, name, sku, is_active
       FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    const before = selected.rows[0];
    if (!before) throw new NotFoundError('Product not found');
    const result = await client.query(
      `UPDATE products SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 RETURNING id, category_id, name, sku, is_active`,
      [id]
    );
    await adminAuditService.record(client, {
      actorUserId,
      action: 'PRODUCT_DEACTIVATED',
      entityType: 'PRODUCT',
      entityId: id,
      before,
      after: result.rows[0],
    });
    return { id, deactivated: true };
  });
  await redisData.invalidateReadCache();
  return product;
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
    conditions.push(`(actor_email ILIKE $${values.length}
      OR action ILIKE $${values.length} OR entity_type ILIKE $${values.length}
      OR entity_id ILIKE $${values.length} OR reason ILIKE $${values.length}
      OR before_data::TEXT ILIKE $${values.length} OR after_data::TEXT ILIKE $${values.length})`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`after_data->>'status' = $${values.length}`);
  }
  const events = `WITH audit_events AS (
    SELECT l.id::TEXT AS id, l.actor_user_id, u.email AS actor_email,
           l.action, l.entity_type, l.entity_id::TEXT AS entity_id,
           l.before_data, l.after_data, l.reason, l.created_at
    FROM admin_audit_logs l
    JOIN users u ON u.id = l.actor_user_id
    UNION ALL
    SELECT l.id::TEXT, l.actor_user_id, u.email,
           'ORDER_STATUS_TRANSITION', 'PURCHASE_ORDER', l.purchase_order_id::TEXT,
           JSONB_BUILD_OBJECT('status', l.from_status),
           JSONB_BUILD_OBJECT('status', l.to_status),
           l.reason, l.created_at
    FROM purchase_order_audit_logs l
    JOIN users u ON u.id = l.actor_user_id
  )`;
  const where = conditions.join(' AND ');
  const count = await query(`${events} SELECT COUNT(*)::INTEGER AS total FROM audit_events WHERE ${where}`, values);
  const result = await query(
    `${events}
     SELECT id, actor_user_id, actor_email, action, entity_type, entity_id,
            before_data, after_data, reason, created_at
     FROM audit_events
     WHERE ${where}
     ORDER BY created_at DESC, id DESC
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
       (SELECT COUNT(*)::INTEGER FROM supplier_profiles WHERE is_suspended = TRUE) AS suspended_suppliers,
       (SELECT COUNT(*)::INTEGER FROM categories WHERE is_active = TRUE AND deleted_at IS NULL) AS active_categories,
       (SELECT COUNT(*)::INTEGER FROM purchase_requests WHERE status IN ('OPEN', 'QUOTATION_RECEIVED')) AS open_requests,
       (SELECT COUNT(*)::INTEGER FROM purchase_orders WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'REJECTED', 'REFUNDED')) AS active_orders,
       (SELECT COUNT(*)::INTEGER FROM order_disputes WHERE status IN ('OPEN', 'UNDER_REVIEW')) AS open_disputes,
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
  updateSupplierSuspension,
  listCategories,
  createCategory,
  updateCategory,
  deactivateCategory,
  createProduct,
  updateProduct,
  deactivateProduct,
  listOrders,
  getOrder,
  listAuditLogs,
  getDashboard,
};
