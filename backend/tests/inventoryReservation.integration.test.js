const { Pool } = require('pg');
const reservationsService = require('../src/services/inventoryReservationService');

const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDatabase('Inventory reservation PostgreSQL concurrency integration', () => {
  let adminPool;
  let testPool;
  let schema;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    schema = `reservation_test_${process.pid}_${Date.now()}`;
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    testPool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 4,
    });
    await testPool.query(`
      CREATE TABLE supplier_products (
        id INTEGER PRIMARY KEY,
        supplier_user_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        currency CHAR(3) NOT NULL,
        is_active BOOLEAN NOT NULL
      );
      CREATE TABLE inventory (
        id INTEGER PRIMARY KEY,
        supplier_product_id INTEGER NOT NULL REFERENCES supplier_products(id),
        total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
        available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
        reserved_quantity INTEGER NOT NULL CHECK (reserved_quantity >= 0),
        version INTEGER NOT NULL DEFAULT 1,
        last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (reserved_quantity <= total_quantity),
        CHECK (available_quantity + reserved_quantity = total_quantity)
      );
      CREATE TABLE purchase_order_items (
        id INTEGER PRIMARY KEY,
        purchase_order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0)
      );
      CREATE TABLE inventory_reservations (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        inventory_id INTEGER NOT NULL,
        purchase_order_id INTEGER NOT NULL,
        purchase_order_item_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        returned_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (status IN ('ACTIVE', 'CONFIRMED', 'RELEASED', 'EXPIRED', 'CONSUMED', 'RETURNED')),
        CHECK ((status = 'CONSUMED') = (consumed_at IS NOT NULL)),
        CHECK ((status = 'RETURNED') = (returned_at IS NOT NULL))
      );
    `);
  });

  afterAll(async () => {
    if (testPool) await testPool.end();
    if (adminPool && schema) {
      await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
      await adminPool.end();
    }
  });

  it('serializes simultaneous reservations so total reserved never exceeds stock', async () => {
    await testPool.query(
      `INSERT INTO supplier_products (id, supplier_user_id, product_id, currency, is_active)
       VALUES (1, 1, 1, 'USD', TRUE);
       INSERT INTO inventory
         (id, supplier_product_id, total_quantity, available_quantity, reserved_quantity)
       VALUES (1, 1, 10, 10, 0);
       INSERT INTO purchase_order_items (id, purchase_order_id, product_id, quantity)
       VALUES (1, 101, 1, 7), (2, 102, 1, 5);`
    );
    const buyerA = await testPool.connect();
    const buyerB = await testPool.connect();
    async function reserve(client, orderId) {
      try {
        await client.query('BEGIN');
        const result = await reservationsService.reserveForOrder(client, {
          orderId,
          supplierUserId: 1,
          currency: 'USD',
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    const results = await Promise.allSettled([
      reserve(buyerA, 101),
      reserve(buyerB, 102),
    ]);
    buyerA.release();
    buyerB.release();

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected.reason).toMatchObject({ code: 'INVENTORY_RESERVATION_UNAVAILABLE' });

    const inventory = await testPool.query(
      'SELECT total_quantity, available_quantity, reserved_quantity FROM inventory WHERE id = 1'
    );
    expect(inventory.rows[0].available_quantity).toBeGreaterThanOrEqual(0);
    expect(inventory.rows[0].reserved_quantity).toBeLessThanOrEqual(10);
    expect(
      inventory.rows[0].available_quantity + inventory.rows[0].reserved_quantity
    ).toBe(10);
    const storedReservations = await testPool.query(
      'SELECT SUM(quantity)::INTEGER AS quantity, COUNT(*)::INTEGER AS count FROM inventory_reservations'
    );
    expect([5, 7]).toContain(storedReservations.rows[0].quantity);
    expect(storedReservations.rows[0].count).toBe(1);
  });

  it('restores a consumed return exactly once', async () => {
    await testPool.query(
      `INSERT INTO supplier_products (id, supplier_user_id, product_id, currency, is_active)
       VALUES (2, 1, 2, 'USD', TRUE);
       INSERT INTO inventory
         (id, supplier_product_id, total_quantity, available_quantity, reserved_quantity)
       VALUES (2, 2, 7, 7, 0);
       INSERT INTO purchase_order_items (id, purchase_order_id, product_id, quantity)
       VALUES (3, 103, 2, 3);
      INSERT INTO inventory_reservations
         (inventory_id, purchase_order_id, purchase_order_item_id, quantity, status, expires_at, consumed_at)
       VALUES (2, 103, 3, 3, 'CONSUMED', NOW() + INTERVAL '1 hour', NOW());`
    );

    const client = await testPool.connect();
    try {
      await client.query('BEGIN');
      await expect(reservationsService.restoreReturnedInventory(client, 103)).resolves.toBe(1);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await expect(reservationsService.restoreReturnedInventory(testPool, 103)).resolves.toBe(0);

    const [inventory, reservation] = await Promise.all([
      testPool.query('SELECT total_quantity, available_quantity FROM inventory WHERE id = 2'),
      testPool.query('SELECT status, consumed_at, returned_at FROM inventory_reservations WHERE purchase_order_id = 103'),
    ]);
    expect(inventory.rows[0]).toEqual({ total_quantity: 10, available_quantity: 10 });
    expect(reservation.rows[0].status).toBe('RETURNED');
    expect(reservation.rows[0].consumed_at).toBeNull();
    expect(reservation.rows[0].returned_at).not.toBeNull();
  });
});
