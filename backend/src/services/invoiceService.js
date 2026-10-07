const PDFDocument = require('pdfkit');
const { pool, query } = require('../config/db');
const { ConflictError, ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors');
const simulatedPaymentProvider = require('./paymentProviders/simulatedPaymentProvider');
const env = require('../config/env');
const notificationService = require('./notificationService');

async function nextInvoiceNumber(client) {
  const result = await client.query(
    `SELECT 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-'
            || LPAD(NEXTVAL('invoice_number_seq')::TEXT, 8, '0') AS invoice_number`
  );
  return result.rows[0].invoice_number;
}

async function createForOrder(client, orderId) {
  const existing = await client.query('SELECT id FROM invoices WHERE order_id = $1', [orderId]);
  if (existing.rows[0]) {
    throw new ConflictError('An invoice already exists for this order', 'INVOICE_ALREADY_EXISTS');
  }
  const sourceResult = await client.query(
    `SELECT po.id AS order_id, po.buyer_user_id, po.supplier_user_id,
            po.currency, po.subtotal
     FROM purchase_orders po
     WHERE po.id = $1
     FOR UPDATE`,
    [orderId]
  );
  const source = sourceResult.rows[0];
  if (!source) throw new NotFoundError('Purchase order not found');
  const invoiceNumber = await nextInvoiceNumber(client);
  const invoiceResult = await client.query(
    `INSERT INTO invoices
       (invoice_number, order_id, buyer_id, supplier_id, currency, subtotal,
        tax, discount, shipping, total, issue_date, due_date, status)
     VALUES ($1, $2, $3, $4, $5, $6::NUMERIC, 0, 0, 0, $6::NUMERIC, CURRENT_DATE,
             CURRENT_DATE + INTERVAL '30 days',
             CASE WHEN $6::NUMERIC = 0 THEN 'PAID' ELSE 'UNPAID' END)
     RETURNING id, invoice_number, order_id, buyer_id, supplier_id, currency,
               subtotal, tax, discount, shipping, total, amount_paid,
               issue_date, due_date, status, created_at`,
    [
      invoiceNumber,
      source.order_id,
      source.buyer_user_id,
      source.supplier_user_id,
      source.currency,
      source.subtotal,
    ]
  );
  const invoice = invoiceResult.rows[0];
  const items = await client.query(
    `INSERT INTO invoice_items
       (invoice_id, purchase_order_item_id, product_name, product_sku,
        quantity, unit_price, line_total)
     SELECT $1, poi.id, poi.product_name, poi.product_sku,
            poi.quantity, poi.unit_price, poi.line_total
     FROM purchase_order_items poi
     WHERE poi.purchase_order_id = $2`,
    [invoice.id, orderId]
  );
  if (!items.rowCount) throw new ConflictError('Cannot invoice an order with no items');
  return invoice;
}

function assertInvoiceParty(invoice, user) {
  if (invoice.buyer_id === user.id && user.roles.includes('BUYER')) return 'BUYER';
  if (invoice.supplier_id === user.id && user.roles.includes('SUPPLIER')) return 'SUPPLIER';
  throw new ForbiddenError('You do not have access to this invoice');
}

async function listInvoices(user, filters) {
  if (!user.roles.some((role) => ['BUYER', 'SUPPLIER'].includes(role))) {
    throw new ForbiddenError('Only buyers and suppliers can access invoices');
  }
  await query(
    `UPDATE invoices
     SET status = 'OVERDUE', updated_at = NOW()
     WHERE status IN ('UNPAID', 'PARTIALLY_PAID')
       AND due_date < CURRENT_DATE
       AND (buyer_id = $1 OR supplier_id = $1)`,
    [user.id]
  );
  const partyColumn = user.roles.includes('BUYER') ? 'buyer_id' : 'supplier_id';
  const values = [user.id];
  const statusClause = filters.status ? 'AND status = $2' : '';
  if (filters.status) values.push(filters.status);
  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total FROM invoices
     WHERE ${partyColumn} = $1 ${statusClause}`,
    values
  );
  const offset = (filters.page - 1) * filters.limit;
  const result = await query(
    `SELECT id, invoice_number, order_id, buyer_id, supplier_id, currency,
            subtotal, tax, discount, shipping, total, amount_paid,
            issue_date, due_date, status, created_at
     FROM invoices
     WHERE ${partyColumn} = $1 ${statusClause}
     ORDER BY issue_date DESC, created_at DESC
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

async function fetchInvoice(invoiceId, user) {
  await query(
    `UPDATE invoices
     SET status = 'OVERDUE', updated_at = NOW()
     WHERE id = $1 AND status IN ('UNPAID', 'PARTIALLY_PAID')
       AND due_date < CURRENT_DATE
       AND (buyer_id = $2 OR supplier_id = $2)`,
    [invoiceId, user.id]
  );
  const invoiceResult = await query(
    `SELECT i.*, po.order_number,
            buyer_business.name AS buyer_business_name,
            buyer_business.address AS buyer_address,
            buyer_business.city AS buyer_city,
            buyer_business.state AS buyer_state,
            buyer_business.country AS buyer_country,
            buyer_business.registration_number AS buyer_registration_number,
            buyer_business.tax_id AS buyer_tax_id,
            supplier_business.name AS supplier_business_name,
            supplier_business.address AS supplier_address,
            supplier_business.city AS supplier_city,
            supplier_business.state AS supplier_state,
            supplier_business.country AS supplier_country,
            supplier_business.registration_number AS supplier_registration_number,
            supplier_business.tax_id AS supplier_tax_id
     FROM invoices i
     JOIN purchase_orders po ON po.id = i.order_id
     JOIN buyer_profiles bp ON bp.user_id = i.buyer_id
     JOIN businesses buyer_business ON buyer_business.id = bp.business_id
     JOIN supplier_profiles sp ON sp.user_id = i.supplier_id
     JOIN businesses supplier_business ON supplier_business.id = sp.business_id
     WHERE i.id = $1 AND (i.buyer_id = $2 OR i.supplier_id = $2)`,
    [invoiceId, user.id]
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) throw new NotFoundError('Invoice not found');
  const partyRole = assertInvoiceParty(invoice, user);
  const [items, payments] = await Promise.all([
    query(
      `SELECT id, product_name, product_sku, quantity, unit_price, line_total
       FROM invoice_items WHERE invoice_id = $1 ORDER BY id`,
      [invoiceId]
    ),
    query(
      `SELECT id, provider, provider_reference, status, amount, currency, created_at
       FROM payments WHERE invoice_id = $1 ORDER BY created_at`,
      [invoiceId]
    ),
  ]);
  return {
    ...invoice,
    items: items.rows,
    payments: payments.rows,
    can_pay: partyRole === 'BUYER'
      && ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status),
  };
}

async function payInvoice(invoiceId, buyer, amount) {
  if (!buyer.roles.includes('BUYER')) {
    throw new ForbiddenError('Only the buyer can pay this invoice');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      `SELECT po.id, po.status AS order_status
       FROM purchase_orders po
       JOIN invoices i ON i.order_id = po.id
       WHERE i.id = $1 AND i.buyer_id = $2
       FOR UPDATE OF po`,
      [invoiceId, buyer.id]
    );
    if (!orderResult.rows[0]) throw new NotFoundError('Invoice not found');
    const result = await client.query(
      `SELECT id, order_id, buyer_id, supplier_id, currency, total, amount_paid,
              due_date, status
       FROM invoices
       WHERE id = $1 AND buyer_id = $2
       FOR UPDATE`,
      [invoiceId, buyer.id]
    );
    const invoice = result.rows[0];
    invoice.order_status = orderResult.rows[0].order_status;
    if (invoice.order_status !== 'PAYMENT_PENDING') {
      throw new ConflictError(
        'An invoice can be paid only when its purchase order is PAYMENT_PENDING',
        'ORDER_NOT_READY_FOR_PAYMENT'
      );
    }
    if (['PAID', 'REFUNDED'].includes(invoice.status)) {
      throw new ConflictError('This invoice cannot accept another payment', 'INVOICE_NOT_PAYABLE');
    }
    const totalCents = toCents(invoice.total);
    const paidCents = toCents(invoice.amount_paid);
    const paymentCents = amount === undefined ? totalCents - paidCents : toCents(amount);
    if (!Number.isFinite(paymentCents) || paymentCents <= 0 || paymentCents > totalCents - paidCents) {
      throw new ValidationError('Payment amount must be greater than zero and no more than the outstanding balance');
    }
    const paymentAmount = fromCents(paymentCents);
    await client.query(
      `UPDATE invoices SET status = 'PAYMENT_INITIATED', updated_at = NOW() WHERE id = $1`,
      [invoiceId]
    );
    const payment = await simulatedPaymentProvider.initiatePayment({
      amount: paymentAmount.toFixed(2),
      currency: invoice.currency,
      invoiceId,
    });
    const paymentResult = await client.query(
      `INSERT INTO payments
         (invoice_id, provider, provider_reference, status, amount, currency, initiated_by, provider_metadata)
       VALUES ($1, $2, $3, 'SUCCEEDED', $4, $5, $6, $7)
       RETURNING id, provider, provider_reference, status, amount, currency, created_at`,
      [
        invoiceId,
        payment.provider,
        payment.providerReference,
        paymentAmount.toFixed(2),
        invoice.currency,
        buyer.id,
        JSON.stringify(payment.metadata),
      ]
    );
    if (env.nodeEnv !== 'test') {
      await notificationService.createInTransaction(client, {
        userId: invoice.supplier_id,
        type: 'PAYMENT_RECEIVED',
        title: 'Payment received',
        message: `A payment of ${paymentAmount.toFixed(2)} ${invoice.currency} was received.`,
        data: { invoiceId, paymentId: paymentResult.rows[0].id, amount: paymentAmount.toFixed(2) },
        dedupeKey: `payment:${paymentResult.rows[0].id}:received`,
      });
    }
    const updatedInvoice = await client.query(
      `UPDATE invoices
       SET amount_paid = amount_paid + $1,
           status = CASE WHEN amount_paid + $1 = total THEN 'PAID' ELSE 'PARTIALLY_PAID' END,
           updated_at = NOW()
       WHERE id = $2
       RETURNING amount_paid, total, status`,
      [paymentAmount.toFixed(2), invoiceId]
    );
    const newAmountPaidCents = toCents(updatedInvoice.rows[0].amount_paid);
    const nextStatus = updatedInvoice.rows[0].status;
    if (nextStatus === 'PAID') {
      if (invoice.order_status === 'PAYMENT_PENDING') {
        await client.query(
          `INSERT INTO purchase_order_audit_logs
             (purchase_order_id, from_status, to_status, actor_user_id, actor_role, reason)
           VALUES ($1, 'PAYMENT_PENDING', 'PAID', $2, 'BUYER', 'Invoice paid')`,
          [invoice.order_id, buyer.id]
        );
        await client.query(
          `UPDATE purchase_orders
           SET status = 'PAID', paid_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [invoice.order_id]
        );
      }
    }
    await client.query('COMMIT');
    return {
      invoiceId,
      status: nextStatus,
      amountPaid: updatedInvoice.rows[0].amount_paid,
      outstanding: fromCents(totalCents - newAmountPaidCents).toFixed(2),
      payment: paymentResult.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function toCents(amount) {
  const [whole, fraction = ''] = String(amount).split('.');
  return Number(`${whole}${fraction.padEnd(2, '0').slice(0, 2)}`);
}

function fromCents(cents) {
  return cents / 100;
}

function invoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    const pageWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const right = document.page.width - document.page.margins.right;
    const currency = invoice.currency;
    const money = (value) => `${currency} ${Number(value).toFixed(2)}`;
    const date = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC' });

    document.rect(0, 0, document.page.width, 148).fill('#102a43');
    document.fillColor('#ffffff').font('Helvetica-Bold').fontSize(25)
      .text('INVOICE', 48, 42);
    document.font('Helvetica').fontSize(10).fillColor('#cbd5e1')
      .text('PROCUREHUB PURCHASE INVOICE', 48, 78);
    document.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff')
      .text(invoice.invoice_number, right - 210, 48, { width: 210, align: 'right' });
    document.font('Helvetica').fontSize(9).fillColor('#cbd5e1')
      .text(`Order ${invoice.order_number}`, right - 210, 72, { width: 210, align: 'right' })
      .text(`Issued ${date(invoice.issue_date)}  |  Due ${date(invoice.due_date)}`, right - 260, 92, { width: 260, align: 'right' });

    const partiesY = 178;
    document.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('BILL TO', 48, partiesY);
    document.text('SUPPLIER', 310, partiesY);
    const addressText = (party) => [
      party.business_name,
      party.address,
      [party.city, party.state, party.country].filter(Boolean).join(', '),
      party.registration_number ? `Registration: ${party.registration_number}` : null,
      party.tax_id ? `Tax ID: ${party.tax_id}` : null,
    ].filter(Boolean).join('\n');
    document.font('Helvetica').fontSize(9).fillColor('#475569')
      .text(addressText({
        business_name: invoice.buyer_business_name,
        address: invoice.buyer_address,
        city: invoice.buyer_city,
        state: invoice.buyer_state,
        country: invoice.buyer_country,
        registration_number: invoice.buyer_registration_number,
        tax_id: invoice.buyer_tax_id,
      }), 48, partiesY + 17, { width: 220, lineGap: 3 })
      .text(addressText({
        business_name: invoice.supplier_business_name,
        address: invoice.supplier_address,
        city: invoice.supplier_city,
        state: invoice.supplier_state,
        country: invoice.supplier_country,
        registration_number: invoice.supplier_registration_number,
        tax_id: invoice.supplier_tax_id,
      }), 310, partiesY + 17, { width: 235, lineGap: 3 });

    let y = 290;
    document.rect(48, y, pageWidth, 25).fill('#eaf1f7');
    document.fillColor('#334155').font('Helvetica-Bold').fontSize(8);
    document.text('DESCRIPTION', 56, y + 8, { width: 220 });
    document.text('QTY', 310, y + 8, { width: 42, align: 'right' });
    document.text('UNIT PRICE', 365, y + 8, { width: 80, align: 'right' });
    document.text('AMOUNT', right - 80, y + 8, { width: 80, align: 'right' });
    y += 25;

    for (const item of invoice.items) {
      if (y > document.page.height - 135) {
        document.addPage();
        y = 55;
      }
      document.fillColor('#0f172a').font('Helvetica').fontSize(9);
      document.text(`${item.product_name}\n${item.product_sku}`, 56, y + 10, { width: 220 });
      document.text(String(item.quantity), 310, y + 10, { width: 42, align: 'right' });
      document.text(money(item.unit_price), 365, y + 10, { width: 80, align: 'right' });
      document.text(money(item.line_total), right - 80, y + 10, { width: 80, align: 'right' });
      y += 43;
      document.moveTo(48, y).lineTo(right, y).strokeColor('#e2e8f0').stroke();
    }

    y = Math.max(y + 20, 430);
    const totals = [
      ['Subtotal', invoice.subtotal],
      ['Tax', invoice.tax],
      ['Discount', `-${money(invoice.discount)}`],
      ['Shipping', invoice.shipping],
    ];
    document.font('Helvetica').fontSize(9).fillColor('#475569');
    for (const [label, value] of totals) {
      document.text(label, right - 205, y, { width: 100 });
      document.text(typeof value === 'string' && value.startsWith('-') ? value : money(value), right - 95, y, { width: 95, align: 'right' });
      y += 20;
    }
    document.moveTo(right - 205, y).lineTo(right, y).strokeColor('#94a3b8').stroke();
    y += 11;
    document.font('Helvetica-Bold').fontSize(12).fillColor('#102a43');
    document.text('TOTAL', right - 205, y, { width: 100 });
    document.text(money(invoice.total), right - 95, y, { width: 95, align: 'right' });
    document.font('Helvetica').fontSize(8).fillColor('#64748b')
      .text(`Payment status: ${invoice.status}  |  Amount paid: ${money(invoice.amount_paid)}`, 48, document.page.height - 65, { width: pageWidth });
    document.fontSize(7)
      .text('Thank you for your business. This document was generated electronically by ProcureHub.', 48, document.page.height - 48, { width: pageWidth, align: 'center' });
    document.end();
  });
}

async function getInvoicePdf(invoiceId, user) {
  const invoice = await fetchInvoice(invoiceId, user);
  return invoicePdf(invoice);
}

module.exports = {
  createForOrder,
  listInvoices,
  getInvoice: fetchInvoice,
  getInvoicePdf,
  payInvoice,
  invoicePdf,
};
