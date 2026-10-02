const { query } = require('../config/db');

async function getForUser(user) {
  if (user.roles.includes('ADMIN')) {
    const adminService = require('./adminService');
    return adminService.getDashboard();
  }
  if (user.roles.includes('SUPPLIER')) {
    const result = await query(
      `SELECT
         (SELECT COUNT(*)::INTEGER FROM supplier_products WHERE supplier_user_id = $1 AND is_active = TRUE) AS active_products,
         (SELECT COUNT(*)::INTEGER FROM inventory i JOIN supplier_products sp ON sp.id = i.supplier_product_id
          WHERE sp.supplier_user_id = $1 AND i.available_quantity <= i.reorder_level) AS low_stock_items,
         (SELECT COUNT(*)::INTEGER FROM purchase_orders WHERE supplier_user_id = $1
          AND status NOT IN ('COMPLETED', 'CANCELLED', 'REJECTED', 'REFUNDED')) AS active_orders,
         (SELECT COUNT(*)::INTEGER FROM quotations WHERE supplier_user_id = $1 AND status = 'SUBMITTED') AS submitted_quotations,
         (SELECT COUNT(*)::INTEGER FROM invoices WHERE supplier_id = $1
          AND status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')) AS outstanding_invoices,
         (SELECT COALESCE(SUM(amount), 0)::NUMERIC(14,2) FROM payments p
          JOIN invoices i ON i.id = p.invoice_id WHERE i.supplier_id = $1 AND p.status = 'SUCCEEDED') AS received_payments`,
      [user.id]
    );
    return result.rows[0];
  }
  const result = await query(
    `SELECT
       (SELECT COUNT(*)::INTEGER FROM purchase_requests WHERE buyer_user_id = $1
        AND status IN ('OPEN', 'QUOTATION_RECEIVED')) AS open_requests,
       (SELECT COUNT(*)::INTEGER FROM purchase_orders WHERE buyer_user_id = $1
        AND status NOT IN ('COMPLETED', 'CANCELLED', 'REJECTED', 'REFUNDED')) AS active_orders,
       (SELECT COUNT(*)::INTEGER FROM quotations q
        JOIN purchase_requests pr ON pr.id = q.purchase_request_id
        WHERE pr.buyer_user_id = $1 AND q.status = 'SUBMITTED') AS quotations_to_review,
       (SELECT COUNT(*)::INTEGER FROM invoices WHERE buyer_id = $1
        AND status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')) AS outstanding_invoices,
       (SELECT COALESCE(SUM(amount_paid), 0)::NUMERIC(14,2) FROM invoices WHERE buyer_id = $1) AS total_paid`,
    [user.id]
  );
  return result.rows[0];
}

module.exports = { getForUser };
