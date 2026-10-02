const { query } = require('../config/db');

async function list(filters) {
  const values = [];
  const conditions = [
    'u.is_active = TRUE',
    'u.deleted_at IS NULL',
    "sp.verification_status = 'VERIFIED'",
    'sp.is_suspended = FALSE',
  ];
  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`(b.name ILIKE $${values.length}
      OR b.city ILIKE $${values.length}
      OR b.country ILIKE $${values.length})`);
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
    `SELECT sp.user_id AS id, b.name AS business_name, b.city, b.state, b.country,
            sp.rating_average, sp.rating_count,
            COUNT(DISTINCT p.id)::INTEGER AS product_count,
            MIN(spo.unit_price) AS min_price, MAX(spo.unit_price) AS max_price
     FROM supplier_profiles sp
     JOIN users u ON u.id = sp.user_id
     JOIN businesses b ON b.id = sp.business_id
     LEFT JOIN supplier_products spo ON spo.supplier_user_id = sp.user_id AND spo.is_active = TRUE
     LEFT JOIN products p ON p.id = spo.product_id AND p.is_active = TRUE AND p.deleted_at IS NULL
     WHERE ${where}
     GROUP BY sp.user_id, b.id
     ORDER BY b.name
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.limit, (filters.page - 1) * filters.limit]
  );
  const total = count.rows[0].total;
  return { data: result.rows, page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) };
}

async function get(id) {
  const supplier = await query(
    `SELECT sp.user_id AS id, b.name AS business_name, b.registration_number,
            b.address, b.city, b.state, b.country, sp.rating_average, sp.rating_count
     FROM supplier_profiles sp
     JOIN users u ON u.id = sp.user_id AND u.is_active = TRUE AND u.deleted_at IS NULL
     JOIN businesses b ON b.id = sp.business_id
     WHERE sp.user_id = $1 AND sp.verification_status = 'VERIFIED'
       AND sp.is_suspended = FALSE`,
    [id]
  );
  const result = supplier.rows[0];
  if (!result) {
    const { NotFoundError } = require('../utils/errors');
    throw new NotFoundError('Supplier not found');
  }
  const products = await query(
    `SELECT sp.id AS supplier_product_id, p.id AS product_id, p.name, p.sku,
            sp.unit_price, sp.currency, sp.lead_time_days,
            i.available_quantity, i.total_quantity
     FROM supplier_products sp
     JOIN products p ON p.id = sp.product_id
     JOIN inventory i ON i.supplier_product_id = sp.id
     WHERE sp.supplier_user_id = $1 AND sp.is_active = TRUE
       AND p.is_active = TRUE AND p.deleted_at IS NULL
     ORDER BY p.name`,
    [id]
  );
  return { ...result, products: products.rows };
}

module.exports = { list, get };
