const invoiceService = require('../src/services/invoiceService');
const { query, pool } = require('../src/config/db');

const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDatabase('Payment PostgreSQL integration', () => {
  let fixture;

  beforeEach(async () => {
    const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const buyer = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, 'integration-test-hash', 'Payment', 'Buyer') RETURNING id`,
      [`payment-buyer-${suffix}@test.invalid`]
    );
    const supplier = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, 'integration-test-hash', 'Payment', 'Supplier') RETURNING id`,
      [`payment-supplier-${suffix}@test.invalid`]
    );
    const buyerBusiness = await query(
      'INSERT INTO businesses (owner_user_id, name) VALUES ($1, $2) RETURNING id',
      [buyer.rows[0].id, `Payment Buyer ${suffix}`]
    );
    const supplierBusiness = await query(
      'INSERT INTO businesses (owner_user_id, name) VALUES ($1, $2) RETURNING id',
      [supplier.rows[0].id, `Payment Supplier ${suffix}`]
    );
    await query('INSERT INTO buyer_profiles (user_id, business_id) VALUES ($1, $2)', [
      buyer.rows[0].id,
      buyerBusiness.rows[0].id,
    ]);
    await query(
      `INSERT INTO supplier_profiles (user_id, business_id, verification_status)
       VALUES ($1, $2, 'VERIFIED')`,
      [supplier.rows[0].id, supplierBusiness.rows[0].id]
    );
    const category = await query(
      'INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id',
      [`Payment ${suffix}`, `payment-${suffix}`]
    );
    const product = await query(
      `INSERT INTO products (category_id, name, sku)
       VALUES ($1, 'Payment test product', $2) RETURNING id`,
      [category.rows[0].id, `PAY-${suffix}`]
    );
    const purchaseRequest = await query(
      `INSERT INTO purchase_requests
         (request_number, buyer_user_id, title, required_delivery_date, delivery_location, status)
       VALUES ($1, $2, 'Payment test request', CURRENT_DATE + 10, '{"city":"Pune"}', 'QUOTATION_ACCEPTED')
       RETURNING id`,
      [`PAY-PR-${suffix}`, buyer.rows[0].id]
    );
    const requestItem = await query(
      `INSERT INTO purchase_request_items
         (purchase_request_id, product_id, product_name, product_sku, quantity)
       VALUES ($1, $2, 'Payment test product', $3, 2) RETURNING id`,
      [purchaseRequest.rows[0].id, product.rows[0].id, `PAY-${suffix}`]
    );
    const quotation = await query(
      `INSERT INTO quotations
         (quotation_number, purchase_request_id, supplier_user_id, status, currency,
          delivery_time_days, valid_until, subtotal, accepted_at)
       VALUES ($1, $2, $3, 'ACCEPTED', 'USD', 3, NOW() + INTERVAL '1 day', 100, NOW())
       RETURNING id`,
      [`PAY-QT-${suffix}`, purchaseRequest.rows[0].id, supplier.rows[0].id]
    );
    const quotationItem = await query(
      `INSERT INTO quotation_items
         (quotation_id, purchase_request_item_id, product_id, product_name, product_sku,
          quantity, unit_price, line_total)
       VALUES ($1, $2, $3, 'Payment test product', $4, 2, 50, 100)
       RETURNING id`,
      [quotation.rows[0].id, requestItem.rows[0].id, product.rows[0].id, `PAY-${suffix}`]
    );
    const order = await query(
      `INSERT INTO purchase_orders
         (order_number, purchase_request_id, quotation_id, buyer_user_id, supplier_user_id,
          status, currency, subtotal, delivery_time_days, expected_delivery_date,
          required_delivery_date, delivery_location)
       VALUES ($1, $2, $3, $4, $5, 'PAYMENT_PENDING', 'USD', 100, 3,
               CURRENT_DATE + 3, CURRENT_DATE + 10, '{"city":"Pune"}')
       RETURNING id`,
      [
        `PAY-PO-${suffix}`,
        purchaseRequest.rows[0].id,
        quotation.rows[0].id,
        buyer.rows[0].id,
        supplier.rows[0].id,
      ]
    );
    const orderItem = await query(
      `INSERT INTO purchase_order_items
         (purchase_order_id, quotation_item_id, purchase_request_item_id, product_id,
          product_name, product_sku, quantity, unit_price, line_total)
       VALUES ($1, $2, $3, $4, 'Payment test product', $5, 2, 50, 100)
       RETURNING id`,
      [
        order.rows[0].id,
        quotationItem.rows[0].id,
        requestItem.rows[0].id,
        product.rows[0].id,
        `PAY-${suffix}`,
      ]
    );
    const invoice = await query(
      `INSERT INTO invoices
         (invoice_number, order_id, buyer_id, supplier_id, currency, subtotal, total, due_date)
       VALUES ($1, $2, $3, $4, 'USD', 100, 100, CURRENT_DATE + 30)
       RETURNING id`,
      [`PAY-INV-${suffix}`, order.rows[0].id, buyer.rows[0].id, supplier.rows[0].id]
    );

    fixture = {
      buyerId: buyer.rows[0].id,
      supplierId: supplier.rows[0].id,
      categoryId: category.rows[0].id,
      productId: product.rows[0].id,
      requestId: purchaseRequest.rows[0].id,
      requestItemId: requestItem.rows[0].id,
      quotationId: quotation.rows[0].id,
      quotationItemId: quotationItem.rows[0].id,
      orderId: order.rows[0].id,
      orderItemId: orderItem.rows[0].id,
      invoiceId: invoice.rows[0].id,
    };
  });

  afterEach(async () => {
    if (!fixture) return;
    await query('DELETE FROM payments WHERE invoice_id = $1', [fixture.invoiceId]);
    await query('DELETE FROM invoice_items WHERE invoice_id = $1', [fixture.invoiceId]);
    await query('DELETE FROM invoices WHERE id = $1', [fixture.invoiceId]);
    await query('DELETE FROM purchase_order_audit_logs WHERE purchase_order_id = $1', [fixture.orderId]);
    await query('DELETE FROM purchase_order_items WHERE id = $1', [fixture.orderItemId]);
    await query('DELETE FROM purchase_orders WHERE id = $1', [fixture.orderId]);
    await query('DELETE FROM quotation_items WHERE id = $1', [fixture.quotationItemId]);
    await query('DELETE FROM quotations WHERE id = $1', [fixture.quotationId]);
    await query('DELETE FROM purchase_requests WHERE id = $1', [fixture.requestId]);
    await query('DELETE FROM products WHERE id = $1', [fixture.productId]);
    await query('DELETE FROM categories WHERE id = $1', [fixture.categoryId]);
    await query('DELETE FROM buyer_profiles WHERE user_id = $1', [fixture.buyerId]);
    await query('DELETE FROM supplier_profiles WHERE user_id = $1', [fixture.supplierId]);
    await query('DELETE FROM businesses WHERE owner_user_id = ANY($1::UUID[])', [
      [fixture.buyerId, fixture.supplierId],
    ]);
    await query('DELETE FROM users WHERE id = ANY($1::UUID[])', [
      [fixture.buyerId, fixture.supplierId],
    ]);
    fixture = undefined;
  });

  it('persists partial and final payments and completes the order payment state', async () => {
    const buyer = { id: fixture.buyerId, roles: ['BUYER'] };
    const partial = await invoiceService.payInvoice(fixture.invoiceId, buyer, 25.5);
    expect(partial).toMatchObject({ status: 'PARTIALLY_PAID', amountPaid: '25.50' });

    const final = await invoiceService.payInvoice(fixture.invoiceId, buyer);
    expect(final).toMatchObject({ status: 'PAID', amountPaid: '100.00', outstanding: '0.00' });
    const [invoice, order, payments] = await Promise.all([
      query('SELECT status, amount_paid FROM invoices WHERE id = $1', [fixture.invoiceId]),
      query('SELECT status FROM purchase_orders WHERE id = $1', [fixture.orderId]),
      query('SELECT COUNT(*)::INTEGER AS count, SUM(amount) AS amount FROM payments WHERE invoice_id = $1', [fixture.invoiceId]),
    ]);
    expect(invoice.rows[0]).toEqual({ status: 'PAID', amount_paid: '100.00' });
    expect(order.rows[0].status).toBe('PAID');
    expect(payments.rows[0]).toEqual({ count: 2, amount: '100.00' });
  });

  it('denies suppliers payment access without changing the invoice', async () => {
    await expect(invoiceService.payInvoice(fixture.invoiceId, {
      id: fixture.supplierId,
      roles: ['SUPPLIER'],
    }, 10)).rejects.toMatchObject({ statusCode: 403 });
    const invoice = await query('SELECT status, amount_paid FROM invoices WHERE id = $1', [
      fixture.invoiceId,
    ]);
    expect(invoice.rows[0]).toEqual({ status: 'UNPAID', amount_paid: '0.00' });
  });
});

afterAll(async () => {
  if (process.env.TEST_DATABASE_URL) await pool.end();
});
