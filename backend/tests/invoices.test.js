jest.mock('../src/services/authService', () => ({
  getActiveUser: jest.fn(),
}));
jest.mock('../src/services/invoiceService', () => ({
  listInvoices: jest.fn(),
  getInvoice: jest.fn(),
  invoicePdf: jest.fn(),
  payInvoice: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const authService = require('../src/services/authService');
const invoiceService = require('../src/services/invoiceService');
const env = require('../src/config/env');

const buyer = {
  id: 'e6b98e7c-e369-40c7-a165-b3026a2cdab1',
  email: 'buyer@example.com',
  roles: ['BUYER'],
};
const supplier = {
  ...buyer,
  id: 'e6b98e7c-e369-40c7-a165-b3026a2cdab2',
  roles: ['SUPPLIER'],
};
const invoiceId = 'e6b98e7c-e369-40c7-a165-b3026a2cdab3';

function tokenFor(user) {
  return jwt.sign({ sub: user.id }, env.jwtSecret, { algorithm: 'HS256' });
}

describe('Invoice routes', () => {
  afterEach(() => jest.clearAllMocks());

  it('lists only the authenticated user’s invoices using validated filters', async () => {
    authService.getActiveUser.mockResolvedValue(buyer);
    invoiceService.listInvoices.mockResolvedValue({
      data: [{ id: invoiceId, status: 'UNPAID' }],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    const response = await request(app)
      .get('/api/invoices?status=UNPAID&page=1')
      .set('Authorization', `Bearer ${tokenFor(buyer)}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].status).toBe('UNPAID');
    expect(invoiceService.listInvoices).toHaveBeenCalledWith(
      buyer,
      expect.objectContaining({ status: 'UNPAID', page: 1 })
    );
  });

  it('returns invoice details and a private PDF download', async () => {
    authService.getActiveUser.mockResolvedValue(buyer);
    invoiceService.getInvoice.mockResolvedValue({
      id: invoiceId,
      invoice_number: 'INV-20261002-00000001',
      status: 'UNPAID',
    });
    invoiceService.invoicePdf.mockResolvedValue(Buffer.from('%PDF-test'));
    const details = await request(app)
      .get(`/api/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${tokenFor(buyer)}`);
    const pdf = await request(app)
      .get(`/api/invoices/${invoiceId}/pdf`)
      .set('Authorization', `Bearer ${tokenFor(buyer)}`);

    expect(details.status).toBe(200);
    expect(details.body.data.invoice_number).toBe('INV-20261002-00000001');
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.headers['cache-control']).toContain('no-store');
    expect(pdf.body.toString()).toContain('%PDF-test');
  });

  it('simulates payments for buyers and rejects supplier payment attempts', async () => {
    authService.getActiveUser.mockResolvedValue(buyer);
    invoiceService.payInvoice.mockResolvedValue({
      invoiceId,
      status: 'PAID',
      amountPaid: '100.00',
      outstanding: '0.00',
      payment: { provider: 'SIMULATED', provider_reference: 'SIM-ref', status: 'SUCCEEDED' },
    });
    const paid = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${tokenFor(buyer)}`)
      .send({});
    expect(paid.status).toBe(200);
    expect(paid.body.data.status).toBe('PAID');
    expect(paid.body.data.payment.apiKey).toBeUndefined();

    authService.getActiveUser.mockResolvedValue(supplier);
    const denied = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${tokenFor(supplier)}`)
      .send({});
    expect(denied.status).toBe(403);
    expect(invoiceService.payInvoice).toHaveBeenCalledTimes(1);
  });

  it('validates invoice ids, payment amounts, and status filters', async () => {
    authService.getActiveUser.mockResolvedValue(buyer);
    const badFilter = await request(app)
      .get('/api/invoices?status=arbitrary')
      .set('Authorization', `Bearer ${tokenFor(buyer)}`);
    const badAmount = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${tokenFor(buyer)}`)
      .send({ amount: -2 });

    expect(badFilter.status).toBe(400);
    expect(badAmount.status).toBe(400);
    expect(invoiceService.listInvoices).not.toHaveBeenCalled();
    expect(invoiceService.payInvoice).not.toHaveBeenCalled();
  });
});
