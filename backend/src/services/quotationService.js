const { pool, query } = require('../config/db');
const { ConflictError, NotFoundError, ValidationError } = require('../utils/errors');
const orderTransitionService = require('./orderTransitionService');
const jobOutboxService = require('./jobOutboxService');
const env = require('../config/env');
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

async function nextQuotationNumber(client) {
  const result = await client.query(
    `SELECT 'QT-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-'
            || LPAD(NEXTVAL('quotation_number_seq')::TEXT, 8, '0') AS quotation_number`
  );
  return result.rows[0].quotation_number;
}

async function submitQuotation(supplierUserId, purchaseRequestId, input) {
  if (new Date(input.validUntil).getTime() <= Date.now()) {
    throw new ValidationError('Quotation validity must be in the future');
  }
  try {
    return await withTransaction(async (client) => {
      const requestResult = await client.query(
        `SELECT id, status, required_delivery_date
         FROM purchase_requests
         WHERE id = $1
         FOR UPDATE`,
        [purchaseRequestId]
      );
      const purchaseRequest = requestResult.rows[0];
      if (!purchaseRequest
        || !['OPEN', 'QUOTATION_RECEIVED'].includes(purchaseRequest.status)
        || purchaseRequest.required_delivery_date < new Date().toISOString().slice(0, 10)) {
        throw new NotFoundError('Eligible purchase request not found');
      }

      const requestedItems = await client.query(
        `SELECT pri.id, pri.product_id, pri.product_name, pri.product_sku, pri.quantity
         FROM purchase_request_items pri
         WHERE pri.purchase_request_id = $1
         ORDER BY pri.id
         FOR SHARE`,
        [purchaseRequestId]
      );
      if (requestedItems.rowCount !== input.items.length) {
        throw new ValidationError('Quotation must include every requested product exactly once');
      }

      const submittedByRequestItem = new Map(
        input.items.map((item) => [item.purchaseRequestItemId, item])
      );
      const requestedIds = new Set(requestedItems.rows.map((item) => item.id));
      if (input.items.some((item) => !requestedIds.has(item.purchaseRequestItemId))) {
        throw new ValidationError('Quotation contains an item not included in the purchase request');
      }

      const matchedItems = requestedItems.rows.map((requested) => {
        const quoted = submittedByRequestItem.get(requested.id);
        if (!quoted || quoted.quantity < requested.quantity) {
          throw new ValidationError(
            `Quoted quantity for ${requested.product_name} cannot be below the requested quantity`
          );
        }
        return { requested, quoted };
      });

      const offers = await client.query(
        `SELECT sp.product_id, sp.currency, i.available_quantity
         FROM supplier_products sp
         JOIN inventory i ON i.supplier_product_id = sp.id
         JOIN products p ON p.id = sp.product_id
           AND p.is_active = TRUE AND p.deleted_at IS NULL
         JOIN categories c ON c.id = p.category_id
           AND c.is_active = TRUE AND c.deleted_at IS NULL
         WHERE sp.supplier_user_id = $1
           AND sp.is_active = TRUE
           AND sp.product_id = ANY($2::UUID[])
         FOR UPDATE OF i`,
        [supplierUserId, requestedItems.rows.map((item) => item.product_id)]
      );
      const offersByProduct = new Map();
      for (const offer of offers.rows) {
        const productOffers = offersByProduct.get(offer.product_id) || [];
        productOffers.push(offer);
        offersByProduct.set(offer.product_id, productOffers);
      }
      for (const { requested } of matchedItems) {
        const quoted = submittedByRequestItem.get(requested.id);
        const offer = offersByProduct.get(requested.product_id)
          ?.find((productOffer) => productOffer.currency === input.currency);
        if (!offer || offer.available_quantity < quoted.quantity) {
          throw new ConflictError(
            `Insufficient active inventory for ${requested.product_name}`,
            'SUPPLIER_NOT_ELIGIBLE'
          );
        }
      }

      const lineItems = matchedItems.map(({ requested, quoted }) => {
        const unitPriceCents = Math.round(quoted.unitPrice * 100);
        const lineTotalCents = unitPriceCents * quoted.quantity;
        if (!Number.isSafeInteger(lineTotalCents) || lineTotalCents > 99999999999999) {
          throw new ValidationError('Quotation line total is outside the supported amount range');
        }
        return {
          requested,
          quoted,
          unitPrice: (unitPriceCents / 100).toFixed(2),
          lineTotal: (lineTotalCents / 100).toFixed(2),
          lineTotalCents,
        };
      });
      const subtotalCents = lineItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
      if (!Number.isSafeInteger(subtotalCents) || subtotalCents > 99999999999999) {
        throw new ValidationError('Quotation subtotal is outside the supported amount range');
      }

      const number = await nextQuotationNumber(client);
      const quotationResult = await client.query(
        `INSERT INTO quotations
           (quotation_number, purchase_request_id, supplier_user_id, currency,
            delivery_time_days, valid_until, subtotal, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, quotation_number, purchase_request_id, supplier_user_id,
                   status, currency, delivery_time_days, valid_until, subtotal, notes,
                   created_at`,
        [
          number,
          purchaseRequestId,
          supplierUserId,
          input.currency,
          input.deliveryTimeDays,
          input.validUntil,
          (subtotalCents / 100).toFixed(2),
          input.notes || null,
        ]
      );
      const quotation = quotationResult.rows[0];
      for (const { requested, quoted, unitPrice, lineTotal } of lineItems) {
        await client.query(
          `INSERT INTO quotation_items
             (quotation_id, purchase_request_item_id, product_id, product_name,
              product_sku, quantity, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            quotation.id,
            requested.id,
            requested.product_id,
            requested.product_name,
            requested.product_sku,
            quoted.quantity,
            unitPrice,
            lineTotal,
          ]
        );
      }
      await client.query(
        `UPDATE purchase_requests
         SET status = 'QUOTATION_RECEIVED', updated_at = NOW()
         WHERE id = $1 AND status = 'OPEN'`,
        [purchaseRequestId]
      );

      return {
        ...quotation,
        subtotal: (subtotalCents / 100).toFixed(2),
        items: lineItems.map(({ requested, quoted, unitPrice, lineTotal }) => ({
          product_id: requested.product_id,
          product_name: requested.product_name,
          product_sku: requested.product_sku,
          quantity: quoted.quantity,
          unit_price: unitPrice,
          line_total: lineTotal,
        })),
      };
    });
  } catch (error) {
    if (error.code === '23505') {
      throw new ConflictError(
        'This supplier has already submitted a quotation for the request',
        'QUOTATION_ALREADY_SUBMITTED'
      );
    }
    throw error;
  }
}

async function listBuyerQuotations(buyerUserId, purchaseRequestId) {
  const requestResult = await query(
    `SELECT id, status
     FROM purchase_requests
     WHERE id = $1 AND buyer_user_id = $2`,
    [purchaseRequestId, buyerUserId]
  );
  if (!requestResult.rows[0]) throw new NotFoundError('Purchase request not found');

  await expireOverdueForRequest(purchaseRequestId);
  const result = await query(
    `SELECT q.id, q.quotation_number, q.purchase_request_id, q.supplier_user_id,
            q.status, q.currency, q.delivery_time_days, q.valid_until, q.subtotal,
            q.notes, q.created_at, b.name AS supplier_business_name,
            b.city AS supplier_city, b.state AS supplier_state,
            b.country AS supplier_country, sp.verification_status,
            sp.rating_average, sp.rating_count
     FROM quotations q
     JOIN supplier_profiles sp ON sp.user_id = q.supplier_user_id
     JOIN businesses b ON b.id = sp.business_id
     WHERE q.purchase_request_id = $1
     ORDER BY q.status = 'ACCEPTED' DESC, q.currency, q.subtotal ASC, q.created_at ASC`,
    [purchaseRequestId]
  );
  return Promise.all(result.rows.map(async (quotation) => ({
    ...quotation,
    items: await getQuotationItems(quotation.id),
  })));
}

async function getQuotationItems(quotationId) {
  const result = await query(
    `SELECT id, purchase_request_item_id, product_id, product_name,
            product_sku, quantity, unit_price, line_total
     FROM quotation_items
     WHERE quotation_id = $1
     ORDER BY product_name, id`,
    [quotationId]
  );
  return result.rows;
}

async function listSupplierQuotations(supplierUserId, filters) {
  await query(
    `UPDATE quotations
     SET status = 'EXPIRED', expired_at = NOW(), updated_at = NOW()
     WHERE supplier_user_id = $1 AND status = 'SUBMITTED' AND valid_until <= NOW()`,
    [supplierUserId]
  );
  const values = [supplierUserId];
  const statusClause = filters.status ? `AND q.status = $2` : '';
  if (filters.status) values.push(filters.status);
  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM quotations q
     WHERE q.supplier_user_id = $1 ${statusClause}`,
    values
  );
  const offset = (filters.page - 1) * filters.limit;
  const result = await query(
    `SELECT q.id, q.quotation_number, q.purchase_request_id, q.status,
            q.currency, q.delivery_time_days, q.valid_until, q.subtotal, q.created_at,
            pr.request_number, pr.title AS request_title
     FROM quotations q
     JOIN purchase_requests pr ON pr.id = q.purchase_request_id
     WHERE q.supplier_user_id = $1 ${statusClause}
     ORDER BY q.created_at DESC
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

async function getQuotationForUser(user, quotationId) {
  await expireOverdueById(quotationId);
  const result = await query(
    `SELECT q.id, q.quotation_number, q.purchase_request_id, q.supplier_user_id,
            q.status, q.currency, q.delivery_time_days, q.valid_until, q.subtotal,
            q.notes, q.created_at, pr.request_number, pr.title AS request_title,
            pr.status AS request_status,
            b.name AS supplier_business_name, b.city AS supplier_city,
            b.state AS supplier_state, b.country AS supplier_country,
            sp.verification_status, sp.rating_average, sp.rating_count
     FROM quotations q
     JOIN purchase_requests pr ON pr.id = q.purchase_request_id
     JOIN supplier_profiles sp ON sp.user_id = q.supplier_user_id
     JOIN businesses b ON b.id = sp.business_id
     WHERE q.id = $1
       AND (q.supplier_user_id = $2 OR pr.buyer_user_id = $2)`,
    [quotationId, user.id]
  );
  const quotation = result.rows[0];
  if (!quotation) throw new NotFoundError('Quotation not found');
  return { ...quotation, items: await getQuotationItems(quotationId) };
}

async function acceptQuotationInTransaction(client, buyerUserId, quotationId) {
  const quotationLookup = await client.query(
    'SELECT purchase_request_id FROM quotations WHERE id = $1',
    [quotationId]
  );
  if (!quotationLookup.rows[0]) throw new NotFoundError('Quotation not found');
  const purchaseRequestId = quotationLookup.rows[0].purchase_request_id;

  const requestResult = await client.query(
    `SELECT id, status
     FROM purchase_requests
     WHERE id = $1 AND buyer_user_id = $2
     FOR UPDATE`,
    [purchaseRequestId, buyerUserId]
  );
  if (!requestResult.rows[0]) throw new NotFoundError('Quotation not found');
  const purchaseRequest = requestResult.rows[0];
  if (purchaseRequest.status === 'CANCELLED') {
    return { failure: 'PURCHASE_REQUEST_CANCELLED' };
  }
  if (purchaseRequest.status === 'QUOTATION_ACCEPTED') {
    return { failure: 'QUOTATION_ALREADY_ACCEPTED' };
  }

  const selectedResult = await client.query(
    `SELECT id, status, valid_until
     FROM quotations
     WHERE id = $1 AND purchase_request_id = $2
     FOR UPDATE`,
    [quotationId, purchaseRequestId]
  );
  const selected = selectedResult.rows[0];
  if (selected.status !== 'SUBMITTED') {
    return { failure: `QUOTATION_${selected.status}` };
  }
  if (new Date(selected.valid_until).getTime() <= Date.now()) {
    await client.query(
      `UPDATE quotations
       SET status = 'EXPIRED', expired_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [selected.id]
    );
    return { failure: 'QUOTATION_EXPIRED' };
  }

  const accepted = await client.query(
    `UPDATE quotations
     SET status = 'ACCEPTED', accepted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'SUBMITTED'
     RETURNING id, purchase_request_id, supplier_user_id, status, currency,
               delivery_time_days, valid_until, subtotal, accepted_at`,
    [selected.id]
  );
  if (accepted.rowCount !== 1) return { failure: 'QUOTATION_NOT_SUBMITTED' };

  await client.query(
    `UPDATE quotations
     SET status = CASE WHEN valid_until <= NOW() THEN 'EXPIRED' ELSE 'REJECTED' END,
         expired_at = CASE WHEN valid_until <= NOW() THEN NOW() ELSE NULL END,
         rejected_at = CASE WHEN valid_until > NOW() THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE purchase_request_id = $1
       AND id <> $2
       AND status = 'SUBMITTED'`,
    [purchaseRequestId, selected.id]
  );
  await client.query(
    `UPDATE purchase_requests
     SET status = 'QUOTATION_ACCEPTED', updated_at = NOW()
     WHERE id = $1`,
    [purchaseRequestId]
  );
  const purchaseOrder = await orderTransitionService.createFromAcceptedQuotation(client, {
    quotationId: selected.id,
    purchaseRequestId,
    buyerUserId,
  });
  if (env.nodeEnv !== 'test') {
    await jobOutboxService.addOrderStatusNotifications(client, purchaseOrder.id, 'PO_CREATED');
  }
  return { quotation: accepted.rows[0], purchaseOrder };
}

function throwAcceptanceFailure(failure) {
  if (failure) {
    const messages = {
      PURCHASE_REQUEST_CANCELLED: ['A quotation cannot be accepted after the request is cancelled', 'PURCHASE_REQUEST_CANCELLED'],
      QUOTATION_ALREADY_ACCEPTED: ['A quotation has already been accepted for this request', 'QUOTATION_ALREADY_ACCEPTED'],
      QUOTATION_EXPIRED: ['This quotation has expired', 'QUOTATION_EXPIRED'],
      QUOTATION_REJECTED: ['A rejected quotation cannot be accepted', 'QUOTATION_REJECTED'],
      QUOTATION_ACCEPTED: ['This quotation has already been accepted', 'QUOTATION_ALREADY_ACCEPTED'],
      QUOTATION_NOT_SUBMITTED: ['This quotation cannot be accepted in its current state', 'QUOTATION_NOT_ACCEPTABLE'],
    };
    const [message, code] = messages[failure] || [
      'This quotation cannot be accepted in its current state',
      'QUOTATION_NOT_ACCEPTABLE',
    ];
    throw new ConflictError(message, code);
  }
}

async function acceptQuotation(buyerUserId, quotationId) {
  const result = await withTransaction((client) => (
    acceptQuotationInTransaction(client, buyerUserId, quotationId)
  ));
  throwAcceptanceFailure(result.failure);
  await redisData.invalidateReadCache();
  return { ...result.quotation, purchaseOrder: result.purchaseOrder };
}

async function rejectQuotation(buyerUserId, quotationId) {
  const outcome = await withTransaction(async (client) => {
    const lookup = await client.query(
      'SELECT purchase_request_id FROM quotations WHERE id = $1',
      [quotationId]
    );
    if (!lookup.rows[0]) throw new NotFoundError('Quotation not found');
    const requestResult = await client.query(
      `SELECT id, status FROM purchase_requests
       WHERE id = $1 AND buyer_user_id = $2 FOR UPDATE`,
      [lookup.rows[0].purchase_request_id, buyerUserId]
    );
    if (!requestResult.rows[0]) throw new NotFoundError('Quotation not found');
    if (requestResult.rows[0].status === 'CANCELLED') {
      throw new ConflictError('The purchase request is cancelled', 'PURCHASE_REQUEST_CANCELLED');
    }
    if (requestResult.rows[0].status === 'QUOTATION_ACCEPTED') {
      throw new ConflictError(
        'A quotation has already been accepted for this request',
        'QUOTATION_ALREADY_ACCEPTED'
      );
    }

    const result = await client.query(
      `UPDATE quotations
       SET status = 'REJECTED', rejected_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND purchase_request_id = $2 AND status = 'SUBMITTED'
         AND valid_until > NOW()
       RETURNING id, status, rejected_at`,
      [quotationId, requestResult.rows[0].id]
    );
    if (!result.rows[0]) {
      const current = await client.query(
        'SELECT status, valid_until FROM quotations WHERE id = $1',
        [quotationId]
      );
      if (!current.rows[0]) throw new NotFoundError('Quotation not found');
      if (current.rows[0].status === 'SUBMITTED') {
        await client.query(
          `UPDATE quotations
           SET status = 'EXPIRED', expired_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND status = 'SUBMITTED'`,
          [quotationId]
        );
        return { failure: 'QUOTATION_EXPIRED' };
      }
      throw new ConflictError('Only a submitted quotation can be rejected', 'QUOTATION_NOT_REJECTABLE');
    }
    return { quotation: result.rows[0] };
  });
  if (outcome.failure === 'QUOTATION_EXPIRED') {
    throw new ConflictError('This quotation has expired', 'QUOTATION_EXPIRED');
  }
  return outcome.quotation;
}

async function expireOverdueForRequest(requestId) {
  await query(
    `UPDATE quotations
     SET status = 'EXPIRED', expired_at = NOW(), updated_at = NOW()
     WHERE purchase_request_id = $1 AND status = 'SUBMITTED' AND valid_until <= NOW()`,
    [requestId]
  );
}

async function expireOverdueById(quotationId) {
  await query(
    `UPDATE quotations
     SET status = 'EXPIRED', expired_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'SUBMITTED' AND valid_until <= NOW()`,
    [quotationId]
  );
}

async function expireOverdueQuotations() {
  const result = await query(
    `UPDATE quotations
     SET status = 'EXPIRED', expired_at = NOW(), updated_at = NOW()
     WHERE status = 'SUBMITTED' AND valid_until <= NOW()
     RETURNING id`,
  );
  return result.rowCount;
}

module.exports = {
  submitQuotation,
  listBuyerQuotations,
  listSupplierQuotations,
  getQuotationForUser,
  acceptQuotationInTransaction,
  throwAcceptanceFailure,
  acceptQuotation,
  rejectQuotation,
  expireOverdueForRequest,
  expireOverdueById,
  expireOverdueQuotations,
};
