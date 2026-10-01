const { pool, query } = require('../config/db');
const env = require('../config/env');
const { ConflictError, NotFoundError } = require('../utils/errors');
const OrderStateMachine = require('./orderStateMachine');

async function reserveForOrder(client, {
  orderId,
  supplierUserId,
  currency,
}) {
  const items = await client.query(
    `SELECT id, product_id, quantity
     FROM purchase_order_items
     WHERE purchase_order_id = $1
     ORDER BY product_id, id`,
    [orderId]
  );
  if (!items.rowCount) {
    throw new ConflictError('A purchase order must contain items before inventory can be reserved');
  }

  const expiresAt = new Date(Date.now() + env.orderReservationTtlHours * 60 * 60 * 1000);
  const reservations = [];
  for (const item of items.rows) {
    const locked = await client.query(
      `SELECT i.id, i.available_quantity
       FROM supplier_products sp
       JOIN inventory i ON i.supplier_product_id = sp.id
       WHERE sp.supplier_user_id = $1
         AND sp.product_id = $2
         AND sp.currency = $3
         AND sp.is_active = TRUE
       FOR UPDATE OF i`,
      [supplierUserId, item.product_id, currency]
    );
    const inventory = locked.rows[0];
    if (!inventory || inventory.available_quantity < item.quantity) {
      throw new ConflictError(
        `Insufficient inventory to reserve ${item.quantity} units`,
        'INVENTORY_RESERVATION_UNAVAILABLE'
      );
    }
    const updated = await client.query(
      `UPDATE inventory
       SET available_quantity = available_quantity - $1,
           reserved_quantity = reserved_quantity + $1,
           version = version + 1,
           last_updated_at = NOW()
       WHERE id = $2 AND available_quantity >= $1
       RETURNING id`,
      [item.quantity, inventory.id]
    );
    if (updated.rowCount !== 1) {
      throw new ConflictError(
        'Inventory changed while the reservation was being created',
        'INVENTORY_RESERVATION_UNAVAILABLE'
      );
    }
    const reservation = await client.query(
      `INSERT INTO inventory_reservations
         (inventory_id, purchase_order_id, purchase_order_item_id, quantity, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, inventory_id, purchase_order_id, purchase_order_item_id,
                 quantity, status, expires_at`,
      [inventory.id, orderId, item.id, item.quantity, expiresAt]
    );
    reservations.push(reservation.rows[0]);
  }
  return reservations;
}

async function reservationRows(client, orderId, statuses) {
  const result = await client.query(
    `SELECT id, inventory_id, quantity
     FROM inventory_reservations
     WHERE purchase_order_id = $1 AND status = ANY($2::TEXT[])
     ORDER BY inventory_id, id
     FOR UPDATE`,
    [orderId, statuses]
  );
  return result.rows;
}

async function confirmForOrder(client, orderId) {
  const result = await client.query(
    `UPDATE inventory_reservations
     SET status = 'CONFIRMED', confirmed_at = NOW(), updated_at = NOW()
     WHERE purchase_order_id = $1 AND status = 'ACTIVE'
     RETURNING id`,
    [orderId]
  );
  if (!result.rowCount) {
    throw new ConflictError(
      'No active inventory reservations are available to confirm',
      'INVENTORY_RESERVATION_NOT_ACTIVE'
    );
  }
  return result.rowCount;
}

async function restoreReservations(client, rows, finalStatus) {
  for (const reservation of rows) {
    const locked = await client.query(
      'SELECT id FROM inventory WHERE id = $1 FOR UPDATE',
      [reservation.inventory_id]
    );
    if (!locked.rows[0]) throw new NotFoundError('Reserved inventory record not found');
    const updated = await client.query(
      `UPDATE inventory
       SET available_quantity = available_quantity + $1,
           reserved_quantity = reserved_quantity - $1,
           version = version + 1,
           last_updated_at = NOW()
       WHERE id = $2 AND reserved_quantity >= $1
       RETURNING id`,
      [reservation.quantity, reservation.inventory_id]
    );
    if (updated.rowCount !== 1) {
      throw new ConflictError('Reserved inventory quantities are inconsistent');
    }
    await client.query(
      `UPDATE inventory_reservations
       SET status = $1, released_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [finalStatus, reservation.id]
    );
  }
}

async function releaseForOrder(client, orderId, finalStatus = 'RELEASED') {
  if (!['RELEASED', 'EXPIRED'].includes(finalStatus)) {
    throw new ConflictError('Invalid reservation release status');
  }
  const reservations = await reservationRows(client, orderId, ['ACTIVE', 'CONFIRMED']);
  await restoreReservations(client, reservations, finalStatus);
  return reservations.length;
}

async function consumeForOrder(client, orderId) {
  const reservations = await reservationRows(client, orderId, ['CONFIRMED']);
  if (!reservations.length) {
    throw new ConflictError(
      'Confirmed inventory reservations are required before shipment',
      'INVENTORY_RESERVATION_NOT_CONFIRMED'
    );
  }
  for (const reservation of reservations) {
    const locked = await client.query(
      'SELECT id FROM inventory WHERE id = $1 FOR UPDATE',
      [reservation.inventory_id]
    );
    if (!locked.rows[0]) throw new NotFoundError('Reserved inventory record not found');
    const updated = await client.query(
      `UPDATE inventory
       SET total_quantity = total_quantity - $1,
           reserved_quantity = reserved_quantity - $1,
           version = version + 1,
           last_updated_at = NOW()
       WHERE id = $2 AND reserved_quantity >= $1 AND total_quantity >= $1
       RETURNING id`,
      [reservation.quantity, reservation.inventory_id]
    );
    if (updated.rowCount !== 1) {
      throw new ConflictError('Reserved inventory quantities are inconsistent');
    }
    await client.query(
      `UPDATE inventory_reservations
       SET status = 'CONSUMED', consumed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [reservation.id]
    );
  }
  return reservations.length;
}

async function expireOverdueReservations() {
  const candidates = await query(
    `SELECT DISTINCT purchase_order_id
     FROM inventory_reservations
     WHERE status = 'ACTIVE' AND expires_at <= NOW()
     ORDER BY purchase_order_id`
  );
  let expiredCount = 0;
  for (const { purchase_order_id: orderId } of candidates.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orderResult = await client.query(
        'SELECT id, status FROM purchase_orders WHERE id = $1 FOR UPDATE',
        [orderId]
      );
      const order = orderResult.rows[0];
      if (!order || order.status !== 'PO_CREATED') {
        await client.query('COMMIT');
        continue;
      }
      const overdueResult = await client.query(
        `SELECT id, inventory_id, quantity
         FROM inventory_reservations
         WHERE purchase_order_id = $1 AND status = 'ACTIVE' AND expires_at <= NOW()
         ORDER BY inventory_id, id
         FOR UPDATE`,
        [orderId]
      );
      if (!overdueResult.rowCount) {
        await client.query('COMMIT');
        continue;
      }
      OrderStateMachine.assertTransition(order.status, 'EXPIRED');
      OrderStateMachine.assertPermission('EXPIRED', 'SYSTEM');
      await restoreReservations(client, overdueResult.rows, 'EXPIRED');
      await client.query(
        `INSERT INTO purchase_order_audit_logs
           (purchase_order_id, from_status, to_status, actor_user_id, actor_role, reason)
         VALUES ($1, $2, 'EXPIRED', NULL, 'SYSTEM', $3)`,
        [orderId, order.status, 'Inventory reservation expired before supplier confirmation']
      );
      await client.query(
        `UPDATE purchase_orders
         SET status = 'EXPIRED', expired_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'PO_CREATED'`,
        [orderId]
      );
      await client.query('COMMIT');
      expiredCount += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return expiredCount;
}

module.exports = {
  reserveForOrder,
  confirmForOrder,
  releaseForOrder,
  consumeForOrder,
  expireOverdueReservations,
};
