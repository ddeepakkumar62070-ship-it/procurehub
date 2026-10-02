const authService = require('../src/services/authService');
const catalogService = require('../src/services/catalogService');
const purchaseRequestService = require('../src/services/purchaseRequestService');
const quotationService = require('../src/services/quotationService');
const { pool, query } = require('../src/config/db');

const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDatabase('PostgreSQL authorization and ownership integration', () => {
  let fixtures;

  async function createUser(email, firstName, lastName) {
    const result = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, 'integration-test-hash', $2, $3)
       RETURNING id`,
      [email, firstName, lastName]
    );
    return result.rows[0].id;
  }

  async function createBusiness(userId, name) {
    const result = await query(
      'INSERT INTO businesses (owner_user_id, name) VALUES ($1, $2) RETURNING id',
      [userId, name]
    );
    return result.rows[0].id;
  }

  beforeEach(async () => {
    const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const buyerOne = await createUser(`buyer-one-${suffix}@test.invalid`, 'Buyer', 'One');
    const buyerTwo = await createUser(`buyer-two-${suffix}@test.invalid`, 'Buyer', 'Two');
    const supplierOne = await createUser(`supplier-one-${suffix}@test.invalid`, 'Supplier', 'One');
    const supplierTwo = await createUser(`supplier-two-${suffix}@test.invalid`, 'Supplier', 'Two');
    const buyerBusinessOne = await createBusiness(buyerOne, 'Buyer One Ltd');
    const buyerBusinessTwo = await createBusiness(buyerTwo, 'Buyer Two Ltd');
    const supplierBusinessOne = await createBusiness(supplierOne, 'Supplier One Ltd');
    const supplierBusinessTwo = await createBusiness(supplierTwo, 'Supplier Two Ltd');
    await query(
      `INSERT INTO buyer_profiles (user_id, business_id) VALUES ($1, $2), ($3, $4)`,
      [buyerOne, buyerBusinessOne, buyerTwo, buyerBusinessTwo]
    );
    await query(
      `INSERT INTO supplier_profiles (user_id, business_id, verification_status)
       VALUES ($1, $2, 'VERIFIED'), ($3, $4, 'VERIFIED')`,
      [supplierOne, supplierBusinessOne, supplierTwo, supplierBusinessTwo]
    );
    const category = await query(
      `INSERT INTO categories (name, slug)
       VALUES ($1, $2) RETURNING id`,
      [`Integration ${suffix}`, `integration-${suffix}`]
    );
    const product = await query(
      `INSERT INTO products (category_id, name, sku)
       VALUES ($1, 'Integration product', $2) RETURNING id`,
      [category.rows[0].id, `SKU-${suffix}`]
    );
    const offers = await query(
      `INSERT INTO supplier_products (supplier_user_id, product_id, unit_price, currency)
       VALUES ($1, $3, 10, 'USD'), ($2, $3, 12, 'USD')
       RETURNING id, supplier_user_id`,
      [supplierOne, supplierTwo, product.rows[0].id]
    );
    const offerIds = Object.fromEntries(
      offers.rows.map((offer) => [offer.supplier_user_id, offer.id])
    );
    await query(
      `INSERT INTO inventory (supplier_product_id, total_quantity, available_quantity)
       SELECT id, 10, 10 FROM supplier_products WHERE id = ANY($1::UUID[])`,
      [Object.values(offerIds)]
    );
    const purchaseRequest = await query(
      `INSERT INTO purchase_requests
         (request_number, buyer_user_id, title, required_delivery_date, delivery_location)
       VALUES ($1, $2, 'Integration request', CURRENT_DATE + 10, '{"city":"Pune"}')
       RETURNING id`,
      [`PR-${suffix}`, buyerOne]
    );
    const requestItem = await query(
      `INSERT INTO purchase_request_items
         (purchase_request_id, product_id, product_name, product_sku, quantity)
       VALUES ($1, $2, 'Integration product', $3, 1) RETURNING id`,
      [purchaseRequest.rows[0].id, product.rows[0].id, `SKU-${suffix}`]
    );
    const quotation = await query(
      `INSERT INTO quotations
         (quotation_number, purchase_request_id, supplier_user_id, currency,
          delivery_time_days, valid_until, subtotal)
       VALUES ($1, $2, $3, 'USD', 3, NOW() + INTERVAL '1 day', 10)
       RETURNING id`,
      [`QT-${suffix}`, purchaseRequest.rows[0].id, supplierOne]
    );

    fixtures = {
      buyerOne,
      buyerTwo,
      supplierOne,
      supplierTwo,
      categoryId: category.rows[0].id,
      productId: product.rows[0].id,
      offerIds: offerIds,
      requestId: purchaseRequest.rows[0].id,
      requestItemId: requestItem.rows[0].id,
      quotationId: quotation.rows[0].id,
    };
  });

  afterEach(async () => {
    if (!fixtures) return;
    await query('DELETE FROM quotations WHERE id = $1', [fixtures.quotationId]);
    await query('DELETE FROM purchase_requests WHERE id = $1', [fixtures.requestId]);
    await query('DELETE FROM inventory WHERE supplier_product_id = ANY($1::UUID[])', [fixtures.offerIds]);
    await query('DELETE FROM supplier_products WHERE id = ANY($1::UUID[])', [fixtures.offerIds]);
    await query('DELETE FROM products WHERE id = $1', [fixtures.productId]);
    await query('DELETE FROM categories WHERE id = $1', [fixtures.categoryId]);
    await query('DELETE FROM supplier_profiles WHERE user_id = ANY($1::UUID[])', [
      [fixtures.supplierOne, fixtures.supplierTwo],
    ]);
    await query('DELETE FROM buyer_profiles WHERE user_id = ANY($1::UUID[])', [
      [fixtures.buyerOne, fixtures.buyerTwo],
    ]);
    await query('DELETE FROM businesses WHERE owner_user_id = ANY($1::UUID[])', [
      [fixtures.buyerOne, fixtures.buyerTwo, fixtures.supplierOne, fixtures.supplierTwo],
    ]);
    await query('DELETE FROM users WHERE id = ANY($1::UUID[])', [
      [fixtures.buyerOne, fixtures.buyerTwo, fixtures.supplierOne, fixtures.supplierTwo],
    ]);
    fixtures = undefined;
  });

  it('does not expose another supplier’s private inventory or permit offer mutation', async () => {
    const ownOffers = await catalogService.listSupplierProducts(fixtures.supplierOne);
    expect(ownOffers).toHaveLength(1);
    expect(ownOffers[0].id).toBe(fixtures.offerIds[fixtures.supplierOne]);
    await expect(catalogService.updateSupplierProduct(
      fixtures.supplierOne,
      fixtures.offerIds[fixtures.supplierTwo],
      { unitPrice: 1 }
    )).rejects.toMatchObject({ statusCode: 404 });
  });

  it('hides non-verified or suspended supplier offers from public product details', async () => {
    await query(
      'UPDATE supplier_profiles SET is_suspended = TRUE WHERE user_id = $1',
      [fixtures.supplierTwo]
    );
    const product = await catalogService.getProduct(fixtures.productId);
    expect(product.supplierProducts.map((offer) => offer.supplier_id)).toEqual([
      fixtures.supplierOne,
    ]);
  });

  it('keeps purchase request details private to the owning buyer', async () => {
    await expect(purchaseRequestService.getBuyerRequest(
      fixtures.buyerOne,
      fixtures.requestId
    )).resolves.toMatchObject({
      id: fixtures.requestId,
      items: [expect.objectContaining({ id: fixtures.requestItemId })],
    });
    await expect(purchaseRequestService.getBuyerRequest(
      fixtures.buyerTwo,
      fixtures.requestId
    )).rejects.toMatchObject({ statusCode: 404 });
  });

  it('does not let a buyer accept a quotation belonging to another buyer', async () => {
    await expect(quotationService.acceptQuotation(
      fixtures.buyerTwo,
      fixtures.quotationId
    )).rejects.toMatchObject({ statusCode: 404 });

    const result = await query(
      `SELECT q.status, pr.status AS request_status
       FROM quotations q
       JOIN purchase_requests pr ON pr.id = q.purchase_request_id
       WHERE q.id = $1`,
      [fixtures.quotationId]
    );
    expect(result.rows[0]).toEqual({ status: 'SUBMITTED', request_status: 'OPEN' });
  });

  it('expires a quotation transactionally and rejects acceptance after expiry', async () => {
    await query(
      `UPDATE quotations SET valid_until = NOW() - INTERVAL '1 minute' WHERE id = $1`,
      [fixtures.quotationId]
    );
    await expect(quotationService.acceptQuotation(
      fixtures.buyerOne,
      fixtures.quotationId
    )).rejects.toMatchObject({ code: 'QUOTATION_EXPIRED', statusCode: 409 });

    const result = await query('SELECT status, expired_at FROM quotations WHERE id = $1', [
      fixtures.quotationId,
    ]);
    expect(result.rows[0].status).toBe('EXPIRED');
    expect(result.rows[0].expired_at).toBeTruthy();
  });

  it('loads only the authenticated user’s own profile', async () => {
    await expect(authService.getProfile(fixtures.buyerTwo)).resolves.toMatchObject({
      id: fixtures.buyerTwo,
      email: expect.stringContaining('buyer-two-'),
    });
  });
});

afterAll(async () => {
  if (process.env.TEST_DATABASE_URL) await pool.end();
});
