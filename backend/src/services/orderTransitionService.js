const { pool, query } = require('../config/db');
const { ConflictError, ForbiddenError, NotFoundError } = require('../utils/errors');
const OrderStateMachine = require('./orderStateMachine');
const inventoryReservationService = require('./inventoryReservationService');
const invoiceService = require('./invoiceService');

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

async function nextOrderNumber(client) {
  const result = await client.query(
    `SELECT 'PO-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-'
            || LPAD(NEXTVAL('purchase_order_number_seq')::TEXT, 8, '0') AS order_number`
  );
  return result.rows[0].order_number;
}

async function writeAudit(client, {
  orderId,
  fromStatus,
  toStatus,
  actorUserId,
  actorRole,
  reason = null,
}) {
  await client.query(
    `INSERT INTO purchase_order_audit_logs
       (purchase_order_id, from_status, to_status, actor_user_id, actor_role, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orderId, fromStatus, toStatus, actorUserId, actorRole, reason]
  );
}

async function createFromAcceptedQuotation(client, {
  quotationId,
  purchaseRequestId,
  buyerUserId,
}) {
  const sourceResult = await client.query(
    `SELECT q.id AS quotation_id, q.purchase_request_id, q.supplier_user_id,
            q.status AS quotation_status, q.currency, q.subtotal,
            q.delivery_time_days, pr.buyer_user_id, pr.status AS purchase_request_status,
            pr.required_delivery_date,
            pr.delivery_location, pr.notes,
            (SELECT COUNT(*)::INTEGER FROM purchase_request_items pri
             WHERE pri.purchase_request_id = pr.id) AS request_item_count
     FROM quotations q
     JOIN purchase_requests pr ON pr.id = q.purchase_request_id
     WHERE q.id = $1 AND pr.id = $2`,
    [quotationId, purchaseRequestId]
  );
  const source = sourceResult.rows[0];
  if (!source || source.buyer_user_id !== buyerUserId) {
    throw new NotFoundError('Accepted quotation not found');
  }
  if (source.quotation_status !== 'ACCEPTED') {
    throw new ConflictError('Only an accepted quotation can create a purchase order');
  }
  if (source.purchase_request_status !== 'QUOTATION_ACCEPTED') {
    throw new ConflictError('Purchase request must be in QUOTATION_ACCEPTED state to create an order');
  }

  const actorRole = 'BUYER';
  OrderStateMachine.assertTransition('QUOTATION_ACCEPTED', 'PO_CREATED');
  OrderStateMachine.assertPermission('PO_CREATED', actorRole);
  const orderNumber = await nextOrderNumber(client);
  const orderResult = await client.query(
    `INSERT INTO purchase_orders
       (order_number, purchase_request_id, quotation_id, buyer_user_id, supplier_user_id,
        status, currency, subtotal, delivery_time_days, expected_delivery_date,
        required_delivery_date, delivery_location, buyer_notes)
     VALUES ($1, $2, $3, $4, $5, 'PO_CREATED', $6, $7, $8,
             CURRENT_DATE + $8::INTEGER, $9, $10, $11)
     RETURNING id, order_number, purchase_request_id, quotation_id, buyer_user_id,
               supplier_user_id, status, currency, subtotal, delivery_time_days,
               expected_delivery_date, required_delivery_date, delivery_location,
               buyer_notes, created_at, updated_at`,
    [
      orderNumber,
      purchaseRequestId,
      quotationId,
      buyerUserId,
      source.supplier_user_id,
      source.currency,
      source.subtotal,
      source.delivery_time_days,
      source.required_delivery_date,
      source.delivery_location,
      source.notes,
    ]
  );
  const order = orderResult.rows[0];

  const itemResult = await client.query(
    `INSERT INTO purchase_order_items
       (purchase_order_id, quotation_item_id, purchase_request_item_id,
        product_id, product_name, product_sku, quantity, unit_price, line_total)
     SELECT $1, qi.id, qi.purchase_request_item_id, qi.product_id,
            qi.product_name, qi.product_sku, qi.quantity, qi.unit_price, qi.line_total
     FROM quotation_items qi
     WHERE qi.quotation_id = $2`,
    [order.id, quotationId]
  );
  if (itemResult.rowCount !== source.request_item_count) {
    throw new ConflictError('Accepted quotation does not cover every requested item');
  }
  const reservations = await inventoryReservationService.reserveForOrder(client, {
    orderId: order.id,
    supplierUserId: source.supplier_user_id,
    currency: source.currency,
  });
  await writeAudit(client, {
    orderId: order.id,
    fromStatus: 'QUOTATION_ACCEPTED',
    toStatus: 'PO_CREATED',
    actorUserId: buyerUserId,
    actorRole,
  });
  return { ...order, reservations };
}

function roleForOrderParty(order, actor) {
  if (order.buyer_user_id === actor.id && actor.roles.includes('BUYER')) return 'BUYER';
  if (order.supplier_user_id === actor.id && actor.roles.includes('SUPPLIER')) return 'SUPPLIER';
  throw new ForbiddenError('You do not have access to this purchase order');
}

async function getOrderItems(orderId, client = { query }) {
  const result = await client.query(
    `SELECT id, quotation_item_id, purchase_request_item_id, product_id,
            product_name, product_sku, quantity, unit_price, line_total
     FROM purchase_order_items
     WHERE purchase_order_id = $1
     ORDER BY product_name, id`,
    [orderId]
  );
  return result.rows;
}

async function getOrderAudit(orderId, client = { query }) {
  const result = await client.query(
    `SELECT id, from_status, to_status, actor_user_id, actor_role, reason, created_at
     FROM purchase_order_audit_logs
     WHERE purchase_order_id = $1
     ORDER BY created_at, id`,
    [orderId]
  );
  return result.rows;
}

async function getOrderHeader(orderId, actor, client = { query, transaction: false }) {
  const result = await client.query(
    `SELECT po.*, pr.request_number, pr.title AS request_title,
            buyer_business.name AS buyer_business_name,
            supplier_business.name AS supplier_business_name
     FROM purchase_orders po
     JOIN purchase_requests pr ON pr.id = po.purchase_request_id
     JOIN buyer_profiles bp ON bp.user_id = po.buyer_user_id
     JOIN businesses buyer_business ON buyer_business.id = bp.business_id
     JOIN supplier_profiles sp ON sp.user_id = po.supplier_user_id
     JOIN businesses supplier_business ON supplier_business.id = sp.business_id
     WHERE po.id = $1
       AND (po.buyer_user_id = $2 OR po.supplier_user_id = $2)
       ${client.transaction ? 'FOR UPDATE OF po' : ''}`,
    [orderId, actor.id]
  );
  const order = result.rows[0];
  if (!order) throw new NotFoundError('Purchase order not found');
  const actorRole = roleForOrderParty(order, actor);
  return { order, actorRole };
}

async function getPurchaseOrder(orderId, actor) {
  const { order, actorRole } = await getOrderHeader(orderId, actor);
  const [items, audit] = await Promise.all([
    getOrderItems(orderId),
    getOrderAudit(orderId),
  ]);
  return {
    ...order,
    items,
    audit,
    allowed_transitions: OrderStateMachine.availableTransitions(order.status)
      .filter((status) => OrderStateMachine.TRANSITION_ROLES[status]?.includes(actorRole)),
  };
}

async function listPurchaseOrders(actor, filters) {
  if (!actor.roles.some((role) => ['BUYER', 'SUPPLIER'].includes(role))) {
    throw new ForbiddenError('Only buyers and suppliers can access purchase orders');
  }
  const values = [actor.id];
  const statusClause = filters.status ? 'AND po.status = $2' : '';
  if (filters.status) values.push(filters.status);
  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM purchase_orders po
    WHERE (po.buyer_user_id = $1 OR po.supplier_user_id = $1) ${statusClause}`,
    values
  );
  const offset = (filters.page - 1) * filters.limit;
  const result = await query(
    `SELECT po.id, po.order_number, po.status, po.currency, po.subtotal,
            po.expected_delivery_date, po.created_at, pr.request_number,
            pr.title AS request_title, buyer_business.name AS buyer_business_name,
            supplier_business.name AS supplier_business_name
     FROM purchase_orders po
     JOIN purchase_requests pr ON pr.id = po.purchase_request_id
     JOIN buyer_profiles bp ON bp.user_id = po.buyer_user_id
     JOIN businesses buyer_business ON buyer_business.id = bp.business_id
     JOIN supplier_profiles sp ON sp.user_id = po.supplier_user_id
     JOIN businesses supplier_business ON supplier_business.id = sp.business_id
     WHERE (po.buyer_user_id = $1 OR po.supplier_user_id = $1) ${statusClause}
     ORDER BY po.created_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.limit, offset]
  );
  return {
    data: result.rows,
    page: filters.page,
    limit: filters.limit,
    total: countResult.rows[0].total,
    totalPages: Math.ceil(countResult.rows[0].total / filters.limit),
  };
}

async function transitionPurchaseOrder(orderId, actor, input) {
  return withTransaction(async (client) => {
    const { order, actorRole } = await getOrderHeader(
      orderId,
      actor,
      { query: client.query.bind(client), transaction: true }
    );
    OrderStateMachine.assertTransition(order.status, input.status);
    OrderStateMachine.assertPermission(input.status, actorRole);

    if (input.status === 'CONFIRMED') {
      await inventoryReservationService.confirmForOrder(client, orderId);
    } else if (input.status === 'SHIPPED') {
      await inventoryReservationService.consumeForOrder(client, orderId);
    } else if (['CANCELLED', 'REJECTED'].includes(input.status)) {
      await inventoryReservationService.releaseForOrder(client, orderId);
    }

    if (input.status === 'INVOICE_GENERATED') {
      await invoiceService.createForOrder(client, orderId);
    }
    if (input.status === 'PAID') {
      const invoice = await client.query(
        `SELECT status FROM invoices WHERE order_id = $1 FOR UPDATE`,
        [orderId]
      );
      if (invoice.rows[0]?.status !== 'PAID') {
        throw new ConflictError('The order invoice must be fully paid before this transition');
      }
    }
    if (input.status === 'REFUNDED') {
      await client.query(
        `UPDATE invoices SET status = 'REFUNDED', updated_at = NOW()
         WHERE order_id = $1`,
        [orderId]
      );
    }

    const auditTimestampColumns = {
      CONFIRMED: 'confirmed_at',
      SHIPPED: 'shipped_at',
      DELIVERED: 'delivered_at',
      INVOICE_GENERATED: 'invoice_generated_at',
      PAID: 'paid_at',
      COMPLETED: 'completed_at',
      CANCELLED: 'cancelled_at',
      RETURNED: 'returned_at',
      REFUNDED: 'refunded_at',
      REJECTED: 'rejected_at',
    };
    const timestampColumn = auditTimestampColumns[input.status];
    const assignments = timestampColumn
      ? `status = $2, updated_at = NOW(), ${timestampColumn} = NOW()`
      : 'status = $2, updated_at = NOW()';

    await writeAudit(client, {
      orderId,
      fromStatus: order.status,
      toStatus: input.status,
      actorUserId: actor.id,
      actorRole,
      reason: input.reason || null,
    });
    const updated = await client.query(
      `UPDATE purchase_orders
       SET ${assignments}
       WHERE id = $1
       RETURNING id, order_number, status, updated_at`,
      [orderId, input.status]
    );
    return updated.rows[0];
  });
}

module.exports = {
  createFromAcceptedQuotation,
  getPurchaseOrder,
  listPurchaseOrders,
  transitionPurchaseOrder,
};
