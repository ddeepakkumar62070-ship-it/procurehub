const { pool, query } = require('../config/db');
const { ConflictError, ForbiddenError, NotFoundError } = require('../utils/errors');

const REVIEWABLE_STATUSES = ['DELIVERED', 'INVOICE_GENERATED', 'PAYMENT_PENDING', 'PAID', 'COMPLETED'];

async function refreshSupplierRating(client, supplierId) {
  const result = await client.query(
    `UPDATE supplier_profiles sp
     SET rating_average = summary.average_rating,
         rating_count = summary.review_count
     FROM (
       SELECT po.supplier_user_id, ROUND(AVG(sr.rating)::NUMERIC, 2) AS average_rating,
              COUNT(*)::INTEGER AS review_count
       FROM supplier_reviews sr
       JOIN purchase_orders po ON po.id = sr.purchase_order_id
       WHERE po.supplier_user_id = $1
       GROUP BY po.supplier_user_id
     ) summary
     WHERE sp.user_id = summary.supplier_user_id
     RETURNING sp.rating_average, sp.rating_count`,
    [supplierId]
  );
  return result.rows[0] || { rating_average: null, rating_count: 0 };
}

async function create(orderId, buyer, input) {
  if (!buyer.roles.includes('BUYER')) throw new ForbiddenError('Only buyers can review suppliers');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      `SELECT id, supplier_user_id, status
       FROM purchase_orders
       WHERE id = $1 AND buyer_user_id = $2
       FOR UPDATE`,
      [orderId, buyer.id]
    );
    const order = orderResult.rows[0];
    if (!order) throw new NotFoundError('Purchase order not found');
    if (!REVIEWABLE_STATUSES.includes(order.status)) {
      throw new ConflictError('A supplier can be reviewed only after delivery', 'ORDER_NOT_REVIEWABLE');
    }
    const reviewResult = await client.query(
      `INSERT INTO supplier_reviews (purchase_order_id, rating, review_text)
       VALUES ($1, $2, $3)
       ON CONFLICT (purchase_order_id) DO NOTHING
       RETURNING id, purchase_order_id, rating, review_text, created_at`,
      [orderId, input.rating, input.review || null]
    );
    const review = reviewResult.rows[0];
    if (!review) throw new ConflictError('This order has already been reviewed', 'SUPPLIER_REVIEW_EXISTS');
    const summary = await refreshSupplierRating(client, order.supplier_user_id);
    await client.query('COMMIT');
    return { ...review, summary };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getForOrder(orderId, buyer) {
  if (!buyer.roles.includes('BUYER')) throw new ForbiddenError('Only buyers can view order review eligibility');
  const result = await query(
    `SELECT po.id AS purchase_order_id, po.status, po.supplier_user_id,
            sr.id, sr.rating, sr.review_text, sr.created_at
     FROM purchase_orders po
     LEFT JOIN supplier_reviews sr ON sr.purchase_order_id = po.id
     WHERE po.id = $1 AND po.buyer_user_id = $2`,
    [orderId, buyer.id]
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Purchase order not found');
  return {
    eligible: REVIEWABLE_STATUSES.includes(row.status),
    review: row.id ? { id: row.id, rating: row.rating, review: row.review_text, created_at: row.created_at } : null,
  };
}

async function listForSupplier(supplierId) {
  const result = await query(
    `SELECT sr.id, sr.rating, sr.review_text, sr.created_at,
            b.name AS buyer_business_name, po.order_number
     FROM supplier_reviews sr
     JOIN purchase_orders po ON po.id = sr.purchase_order_id
     JOIN buyer_profiles bp ON bp.user_id = po.buyer_user_id
     JOIN businesses b ON b.id = bp.business_id
     WHERE po.supplier_user_id = $1
     ORDER BY sr.created_at DESC`,
    [supplierId]
  );
  return result.rows;
}

async function listMine(supplier) {
  if (!supplier.roles.includes('SUPPLIER')) throw new ForbiddenError('Only suppliers can view received reviews');
  return listForSupplier(supplier.id);
}

module.exports = { create, getForOrder, listForSupplier, listMine };
