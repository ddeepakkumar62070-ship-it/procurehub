jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn() },
  query: jest.fn(),
}));
jest.mock('../src/services/paymentProviders/simulatedPaymentProvider', () => ({
  initiatePayment: jest.fn().mockResolvedValue({
    provider: 'SIMULATED',
    providerReference: 'SIM-test-reference',
    status: 'SUCCEEDED',
    amount: '30.00',
    currency: 'USD',
    metadata: { mode: 'simulated' },
  }),
}));

const { pool, query } = require('../src/config/db');
const paymentProvider = require('../src/services/paymentProviders/simulatedPaymentProvider');
const invoiceService = require('../src/services/invoiceService');

describe('InvoiceService', () => {
  let client;

  beforeEach(() => {
    client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
  });

  afterEach(() => jest.clearAllMocks());

  it('creates one invoice and copies order item snapshots', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          order_id: 'order-id',
          buyer_user_id: 'buyer-id',
          supplier_user_id: 'supplier-id',
          currency: 'USD',
          subtotal: '30.00',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ invoice_number: 'INV-20261002-00000001' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'invoice-id', invoice_number: 'INV-20261002-00000001', status: 'UNPAID' }],
      })
      .mockResolvedValueOnce({ rowCount: 2 });

    const result = await invoiceService.createForOrder(client, 'order-id');

    expect(result.status).toBe('UNPAID');
    expect(client.query.mock.calls[3][0]).toContain('INSERT INTO invoices');
    expect(client.query.mock.calls[4][0]).toContain('INSERT INTO invoice_items');
  });

  it('rejects an invoice payment above the outstanding balance', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'order-id', order_status: 'PAYMENT_PENDING' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'invoice-id',
          order_id: 'order-id',
          buyer_id: 'buyer-id',
          supplier_id: 'supplier-id',
          currency: 'USD',
          total: '100.00',
          amount_paid: '30.00',
          due_date: '2099-01-01',
          status: 'PARTIALLY_PAID',
        }],
      })
      .mockResolvedValueOnce({});

    await expect(invoiceService.payInvoice(
      'invoice-id',
      { id: 'buyer-id', roles: ['BUYER'] },
      71
    )).rejects.toMatchObject({ statusCode: 400 });
    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
    expect(paymentProvider.initiatePayment).not.toHaveBeenCalled();
  });

  it('rejects payment until the supplier has moved the order to PAYMENT_PENDING', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'order-id', order_status: 'DELIVERED' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'invoice-id', order_id: 'order-id', buyer_id: 'buyer-id', supplier_id: 'supplier-id',
          currency: 'USD', total: '100.00', amount_paid: '0.00', status: 'UNPAID',
        }],
      })
      .mockResolvedValueOnce({});

    await expect(invoiceService.payInvoice(
      'invoice-id', { id: 'buyer-id', roles: ['BUYER'] }, undefined
    )).rejects.toMatchObject({ code: 'ORDER_NOT_READY_FOR_PAYMENT' });
    expect(paymentProvider.initiatePayment).not.toHaveBeenCalled();
    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });

  it('simulates a partial then full payment and only exposes safe provider fields', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'order-id', order_status: 'PAYMENT_PENDING' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'invoice-id',
          order_id: 'order-id',
          buyer_id: 'buyer-id',
          supplier_id: 'supplier-id',
          currency: 'USD',
          total: '100.00',
          amount_paid: '0.00',
          due_date: '2099-01-01',
          status: 'UNPAID',
        }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{
        id: 'payment-1',
        provider: 'SIMULATED',
        provider_reference: 'SIM-test-reference',
        status: 'SUCCEEDED',
        amount: '30.00',
        currency: 'USD',
      }] })
      .mockResolvedValueOnce({ rows: [{ amount_paid: '30.00', total: '100.00', status: 'PARTIALLY_PAID' }] })
      .mockResolvedValueOnce({});

    const partial = await invoiceService.payInvoice(
      'invoice-id',
      { id: 'buyer-id', roles: ['BUYER'] },
      30
    );

    expect(partial.status).toBe('PARTIALLY_PAID');
    expect(partial.outstanding).toBe('70.00');
    expect(partial.payment.provider).toBe('SIMULATED');
    expect(partial.payment.apiKey).toBeUndefined();
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
    expect(paymentProvider.initiatePayment).toHaveBeenCalledWith(expect.objectContaining({
      amount: '30.00',
      currency: 'USD',
      invoiceId: 'invoice-id',
    }));

    client.query.mockReset();
    client.query
      .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: [{ id: 'order-id', order_status: 'PAYMENT_PENDING' }] })
    .mockResolvedValueOnce({
        rows: [{
          id: 'invoice-id',
          order_id: 'order-id',
          buyer_id: 'buyer-id',
          supplier_id: 'supplier-id',
          currency: 'USD',
          total: '100.00',
          amount_paid: '30.00',
          due_date: '2099-01-01',
          status: 'PARTIALLY_PAID',
        }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{
        id: 'payment-2',
        provider: 'SIMULATED',
        provider_reference: 'SIM-test-reference-2',
        status: 'SUCCEEDED',
        amount: '70.00',
        currency: 'USD',
      }] })
      .mockResolvedValueOnce({ rows: [{ amount_paid: '100.00', total: '100.00', status: 'PAID' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    paymentProvider.initiatePayment.mockResolvedValueOnce({
      provider: 'SIMULATED',
      providerReference: 'SIM-test-reference-2',
      status: 'SUCCEEDED',
      amount: '70.00',
      currency: 'USD',
      metadata: { mode: 'simulated' },
    });

    const paid = await invoiceService.payInvoice(
      'invoice-id',
      { id: 'buyer-id', roles: ['BUYER'] },
      undefined
    );
    expect(paid.status).toBe('PAID');
    expect(client.query.mock.calls.some(([sql]) => sql.includes("SET status = 'PAID'"))).toBe(true);
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
  });

  it('generates a valid PDF document for an invoice', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('UPDATE invoices')) return { rowCount: 0, rows: [] };
      if (sql.includes('FROM invoices i')) {
        return { rows: [{
          id: 'invoice-id',
          invoice_number: 'INV-20261002-00000001',
          order_number: 'PO-20261002-00000001',
          order_date: '2026-09-28T14:30:00.000Z',
          expected_delivery_date: '2026-10-15',
          currency: 'USD',
          subtotal: '30.00',
          tax: '0.00',
          discount: '0.00',
          shipping: '0.00',
          total: '30.00',
          amount_paid: '0.00',
          issue_date: '2026-10-02',
          due_date: '2026-11-01',
          status: 'UNPAID',
          buyer_id: 'buyer-id',
          supplier_id: 'supplier-id',
          buyer_business_name: 'Buyer Co',
          supplier_business_name: 'Supplier Co',
        }] };
      }
      if (sql.includes('FROM invoice_items')) {
        return { rows: [{
          id: 'item-id',
          product_name: 'Rice',
          product_sku: 'RICE-01',
          quantity: 3,
          unit_price: '10.00',
          line_total: '30.00',
        }] };
      }
      return { rows: [] };
    });
    const invoice = await invoiceService.getInvoice(
      'invoice-id',
      { id: 'buyer-id', roles: ['BUYER'] }
    );
    expect(invoice.order_date).toBe('2026-09-28T14:30:00.000Z');
    expect(invoice.expected_delivery_date).toBe('2026-10-15');

    const pdf = await invoiceService.getInvoicePdf(
      'invoice-id',
      { id: 'buyer-id', roles: ['BUYER'] }
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('formats order and delivery calendar dates in UTC without shifting a day', () => {
    expect(invoiceService.formatInvoiceDate(new Date('2026-09-28T23:30:00-10:00'))).toBe('9/29/2026');
    expect(invoiceService.formatInvoiceDate('2026-10-15')).toBe('10/15/2026');
    expect(invoiceService.formatInvoiceDate(null)).toBe('Not set');
  });
});
