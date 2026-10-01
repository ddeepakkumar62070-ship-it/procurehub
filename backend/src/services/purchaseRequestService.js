const { pool, query } = require('../config/db');
const { ConflictError, NotFoundError, ValidationError } = require('../utils/errors');
const notificationService = require('./notificationService');
const env = require('../config/env');

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

async function selectItems(client, requestId) {
  const result = await client.query(
    `SELECT pri.id, pri.product_id, pri.product_name, pri.product_sku, pri.quantity
     FROM purchase_request_items pri
     WHERE pri.purchase_request_id = $1
     ORDER BY pri.created_at, pri.id`,
    [requestId]
  );
  return result.rows;
}

async function selectBuyerRequest(client, buyerUserId, requestId) {
  const result = await client.query(
    `SELECT pr.id, pr.request_number, b.name AS buyer_business_name,
            pr.title, pr.status, pr.required_delivery_date, pr.delivery_location,
            pr.notes, pr.cancelled_at, pr.created_at, pr.updated_at
     FROM purchase_requests pr
     JOIN businesses b ON b.owner_user_id = pr.buyer_user_id
     WHERE pr.id = $1 AND pr.buyer_user_id = $2`,
    [requestId, buyerUserId]
  );
  const request = result.rows[0];
  if (!request) throw new NotFoundError('Purchase request not found');
  return { ...request, items: await selectItems(client, request.id) };
}

function eligibleRequestPredicate(supplierUserId, requestAlias = 'pr', excludeQuoted = false) {
  return `${excludeQuoted ? `NOT EXISTS (
    SELECT 1 FROM quotations own_quotation
    WHERE own_quotation.purchase_request_id = ${requestAlias}.id
      AND own_quotation.supplier_user_id = $1
  ) AND ` : ''}EXISTS (
    SELECT 1
    FROM purchase_request_items eligible_item
    WHERE eligible_item.purchase_request_id = ${requestAlias}.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM purchase_request_items requested_item
    WHERE requested_item.purchase_request_id = ${requestAlias}.id
      AND NOT EXISTS (
        SELECT 1
        FROM supplier_products sp
        JOIN products p ON p.id = sp.product_id
          AND p.is_active = TRUE AND p.deleted_at IS NULL
        JOIN categories c ON c.id = p.category_id
          AND c.is_active = TRUE AND c.deleted_at IS NULL
        JOIN inventory i ON i.supplier_product_id = sp.id
        WHERE sp.supplier_user_id = $1
          AND sp.product_id = requested_item.product_id
          AND sp.is_active = TRUE
          AND i.available_quantity >= requested_item.quantity
      )
  )`;
}

async function createPurchaseRequest(buyerUserId, input) {
  return withTransaction(async (client) => {
    const productIds = input.items.map((item) => item.productId);
    const productsResult = await client.query(
      `SELECT id, name, sku
       FROM products
       WHERE id = ANY($1::UUID[])
         AND is_active = TRUE
         AND deleted_at IS NULL
       FOR SHARE`,
      [productIds]
    );
    if (productsResult.rows.length !== productIds.length) {
      throw new ValidationError('Every requested product must exist and be active');
    }
    const products = new Map(productsResult.rows.map((product) => [product.id, product]));

    const numberResult = await client.query(
      `SELECT 'PR-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-'
              || LPAD(NEXTVAL('purchase_request_number_seq')::TEXT, 8, '0') AS request_number`
    );
    const requestResult = await client.query(
      `INSERT INTO purchase_requests
         (request_number, buyer_user_id, title, required_delivery_date, delivery_location, notes)
       VALUES ($1, $2, $3, $4, $5::JSONB, $6)
       RETURNING id`,
      [
        numberResult.rows[0].request_number,
        buyerUserId,
        input.title,
        input.requiredDeliveryDate,
        JSON.stringify(input.deliveryLocation),
        input.notes || null,
      ]
    );
    const requestId = requestResult.rows[0].id;

    for (const item of input.items) {
      const product = products.get(item.productId);
      await client.query(
        `INSERT INTO purchase_request_items
           (purchase_request_id, product_id, product_name, product_sku, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [requestId, product.id, product.name, product.sku, item.quantity]
      );
    }

    if (env.nodeEnv !== 'test') {
      const eligibleSuppliers = await client.query(
        `SELECT u.id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id AND r.name = 'SUPPLIER'
         WHERE u.is_active = TRUE AND u.deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1
             FROM purchase_request_items requested_item
             WHERE requested_item.purchase_request_id = $1
               AND NOT EXISTS (
                 SELECT 1
                 FROM supplier_products sp
                 JOIN products p ON p.id = sp.product_id
                   AND p.is_active = TRUE AND p.deleted_at IS NULL
                 JOIN categories c ON c.id = p.category_id
                   AND c.is_active = TRUE AND c.deleted_at IS NULL
                 JOIN inventory i ON i.supplier_product_id = sp.id
                 WHERE sp.supplier_user_id = u.id
                   AND sp.product_id = requested_item.product_id
                   AND sp.is_active = TRUE
                   AND i.available_quantity >= requested_item.quantity
               )
           )`,
        [requestId]
      );
      await notificationService.createManyInTransaction(
        client,
        eligibleSuppliers.rows.map((supplier) => ({
          userId: supplier.id,
          type: 'NEW_PURCHASE_REQUEST',
          title: 'New purchase request',
          message: `${input.title} is available for quotation.`,
          data: { purchaseRequestId: requestId },
          dedupeKey: `purchase-request:${requestId}:new`,
        }))
      );
    }

    return selectBuyerRequest(client, buyerUserId, requestId);
  });
}

async function listBuyerRequests(buyerUserId, filters) {
  const values = [buyerUserId];
  let statusCondition = '';
  if (filters.status) {
    values.push(filters.status);
    statusCondition = `AND pr.status = $${values.length}`;
  }
  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM purchase_requests pr
     WHERE pr.buyer_user_id = $1 ${statusCondition}`,
    values
  );
  const total = countResult.rows[0].total;
  const offset = (filters.page - 1) * filters.limit;
  const result = await query(
    `SELECT pr.id, pr.request_number, pr.title, pr.status,
            pr.required_delivery_date, pr.delivery_location, pr.created_at,
            COUNT(pri.id)::INTEGER AS item_count
     FROM purchase_requests pr
     LEFT JOIN purchase_request_items pri ON pri.purchase_request_id = pr.id
     WHERE pr.buyer_user_id = $1 ${statusCondition}
     GROUP BY pr.id
     ORDER BY pr.created_at DESC, pr.id DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.limit, offset]
  );
  return {
    data: result.rows,
    page: filters.page,
    limit: filters.limit,
    total,
    totalPages: Math.ceil(total / filters.limit),
  };
}

async function getBuyerRequest(buyerUserId, requestId) {
  return withTransaction((client) => selectBuyerRequest(client, buyerUserId, requestId));
}

async function cancelBuyerRequest(buyerUserId, requestId) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE purchase_requests
       SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND buyer_user_id = $2
         AND status IN ('OPEN', 'QUOTATION_RECEIVED')
       RETURNING id`,
      [requestId, buyerUserId]
    );
    if (!result.rows[0]) {
      const existing = await client.query(
        'SELECT status FROM purchase_requests WHERE id = $1 AND buyer_user_id = $2',
        [requestId, buyerUserId]
      );
      if (!existing.rows[0]) throw new NotFoundError('Purchase request not found');
      throw new ConflictError(
        'Only an open purchase request can be cancelled',
        'PURCHASE_REQUEST_NOT_CANCELLABLE'
      );
    }
    await client.query(
      `UPDATE quotations
       SET status = 'REJECTED', rejected_at = NOW(), updated_at = NOW()
       WHERE purchase_request_id = $1 AND status = 'SUBMITTED'`,
      [requestId]
    );
    return selectBuyerRequest(client, buyerUserId, requestId);
  });
}

function buildEligibleFilters(supplierUserId, filters) {
  const values = [supplierUserId];
  const conditions = [
    "pr.status IN ('OPEN', 'QUOTATION_RECEIVED')",
    'pr.required_delivery_date >= CURRENT_DATE',
    eligibleRequestPredicate(supplierUserId, 'pr', true),
  ];
  if (filters.keyword) {
    values.push(filters.keyword);
    const parameter = `$${values.length}`;
    conditions.push(
      `(pr.search_document @@ WEBSEARCH_TO_TSQUERY('simple', ${parameter})
        OR EXISTS (
          SELECT 1 FROM purchase_request_items searched_item
          WHERE searched_item.purchase_request_id = pr.id
            AND searched_item.search_document @@ WEBSEARCH_TO_TSQUERY('simple', ${parameter})
        ))`
    );
  }
  if (filters.category) {
    values.push(filters.category);
    conditions.push(`EXISTS (
      SELECT 1
      FROM purchase_request_items category_item
      JOIN products category_product ON category_product.id = category_item.product_id
      WHERE category_item.purchase_request_id = pr.id
        AND category_product.category_id = $${values.length}
    )`);
  }
  if (filters.deliveryBefore) {
    values.push(filters.deliveryBefore);
    conditions.push(`pr.required_delivery_date <= $${values.length}`);
  }
  return { values, where: conditions.join(' AND ') };
}

async function listEligibleRequests(supplierUserId, filters) {
  const { values, where } = buildEligibleFilters(supplierUserId, filters);
  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM purchase_requests pr
     WHERE ${where}`,
    values
  );
  const total = countResult.rows[0].total;
  const offset = (filters.page - 1) * filters.limit;
  const result = await query(
    `SELECT pr.id, pr.request_number, pr.title, pr.required_delivery_date,
            pr.delivery_location, pr.created_at, b.name AS buyer_business_name,
            COUNT(pri.id)::INTEGER AS item_count
     FROM purchase_requests pr
     JOIN businesses b ON b.owner_user_id = pr.buyer_user_id
     JOIN purchase_request_items pri ON pri.purchase_request_id = pr.id
     WHERE ${where}
     GROUP BY pr.id, b.name
     ORDER BY pr.required_delivery_date ASC, pr.created_at ASC, pr.id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.limit, offset]
  );
  return {
    data: result.rows,
    page: filters.page,
    limit: filters.limit,
    total,
    totalPages: Math.ceil(total / filters.limit),
  };
}

async function getEligibleRequest(supplierUserId, requestId) {
  const result = await query(
    `SELECT pr.id, pr.request_number, b.name AS buyer_business_name,
            pr.title, pr.status,
            pr.required_delivery_date, pr.delivery_location, pr.notes,
            pr.created_at, pr.updated_at,
            own_quotation.id AS my_quotation_id,
            own_quotation.status AS my_quotation_status
     FROM purchase_requests pr
     JOIN businesses b ON b.owner_user_id = pr.buyer_user_id
     LEFT JOIN quotations own_quotation
       ON own_quotation.purchase_request_id = pr.id
       AND own_quotation.supplier_user_id = $1
     WHERE pr.id = $2
       AND pr.status IN ('OPEN', 'QUOTATION_RECEIVED')
       AND pr.required_delivery_date >= CURRENT_DATE
       AND ${eligibleRequestPredicate(supplierUserId)}`,
    [supplierUserId, requestId]
  );
  const purchaseRequest = result.rows[0];
  if (!purchaseRequest) throw new NotFoundError('Eligible purchase request not found');

  const items = await query(
    `SELECT pri.id, pri.product_id, pri.product_name, pri.product_sku, pri.quantity,
            c.id AS category_id, c.name AS category_name
     FROM purchase_request_items pri
     JOIN products p ON p.id = pri.product_id
     JOIN categories c ON c.id = p.category_id
     WHERE pri.purchase_request_id = $1
     ORDER BY pri.created_at, pri.id`,
    [purchaseRequest.id]
  );
  return { ...purchaseRequest, items: items.rows };
}

module.exports = {
  createPurchaseRequest,
  listBuyerRequests,
  getBuyerRequest,
  cancelBuyerRequest,
  listEligibleRequests,
  getEligibleRequest,
};
