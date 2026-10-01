jest.mock('../src/services/authService', () => ({
  getActiveUser: jest.fn(),
}));

jest.mock('../src/services/quotationService', () => ({
  submitQuotation: jest.fn(),
  listBuyerQuotations: jest.fn(),
  listSupplierQuotations: jest.fn(),
  getQuotationForUser: jest.fn(),
  acceptQuotation: jest.fn(),
  rejectQuotation: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const authService = require('../src/services/authService');
const quotationService = require('../src/services/quotationService');
const env = require('../src/config/env');

const buyer = {
  id: 'e6b98e7c-e369-40c7-a165-b3026a2cdab1',
  email: 'buyer@example.com',
  first_name: 'Buyer',
  last_name: 'User',
  roles: ['BUYER'],
};
const supplier = {
  ...buyer,
  id: 'e6b98e7c-e369-40c7-a165-b3026a2cdab2',
  email: 'supplier@example.com',
  roles: ['SUPPLIER'],
};
const requestId = 'e6b98e7c-e369-40c7-a165-b3026a2cdab3';
const requestItemId = 'e6b98e7c-e369-40c7-a165-b3026a2cdab4';
const quotationId = 'e6b98e7c-e369-40c7-a165-b3026a2cdab5';

function tokenFor(user) {
  return jwt.sign({ sub: user.id }, env.jwtSecret, { algorithm: 'HS256' });
}

function validQuotation() {
  return {
    currency: 'USD',
    deliveryTimeDays: 5,
    validUntil: new Date(Date.now() + 86_400_000).toISOString(),
    notes: 'Delivered in five business days',
    items: [{ purchaseRequestItemId: requestItemId, quantity: 3, unitPrice: 12.5 }],
  };
}

describe('Quotation routes', () => {
  afterEach(() => jest.clearAllMocks());

  it('lets suppliers submit a validated quotation to a purchase request', async () => {
    authService.getActiveUser.mockResolvedValue(supplier);
    quotationService.submitQuotation.mockResolvedValue({
      id: quotationId,
      status: 'SUBMITTED',
      subtotal: '37.50',
    });
    const response = await request(app)
      .post(`/api/purchase-requests/${requestId}/quotations`)
      .set('Authorization', `Bearer ${tokenFor(supplier)}`)
      .send(validQuotation());

    expect(response.status).toBe(201);
    expect(response.body.data.subtotal).toBe('37.50');
    expect(quotationService.submitQuotation).toHaveBeenCalledWith(
      supplier.id,
      requestId,
      expect.objectContaining({ currency: 'USD' })
    );
  });

  it('rejects expired dates, non-positive quantities, duplicate rows, and unsupported properties', async () => {
    authService.getActiveUser.mockResolvedValue(supplier);
    const invalid = validQuotation();
    invalid.validUntil = new Date(Date.now() - 60_000).toISOString();
    invalid.items = [
      { purchaseRequestItemId: requestItemId, quantity: 0, unitPrice: -1 },
      { purchaseRequestItemId: requestItemId, quantity: 3, unitPrice: 1 },
    ];
    const response = await request(app)
      .post(`/api/purchase-requests/${requestId}/quotations`)
      .set('Authorization', `Bearer ${tokenFor(supplier)}`)
      .send({ ...invalid, unexpected: true });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(quotationService.submitQuotation).not.toHaveBeenCalled();
  });

  it('prevents buyers from submitting supplier quotations', async () => {
    authService.getActiveUser.mockResolvedValue(buyer);
    const response = await request(app)
      .post(`/api/purchase-requests/${requestId}/quotations`)
      .set('Authorization', `Bearer ${tokenFor(buyer)}`)
      .send(validQuotation());

    expect(response.status).toBe(403);
    expect(quotationService.submitQuotation).not.toHaveBeenCalled();
  });

  it('lets buyers view all comparison details for their request', async () => {
    authService.getActiveUser.mockResolvedValue(buyer);
    quotationService.listBuyerQuotations.mockResolvedValue([{
      id: quotationId,
      subtotal: '37.50',
      currency: 'USD',
      delivery_time_days: 5,
      rating_average: '4.50',
      supplier_business_name: 'Supplier Co',
    }]);
    const response = await request(app)
      .get(`/api/purchase-requests/${requestId}/quotations`)
      .set('Authorization', `Bearer ${tokenFor(buyer)}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].rating_average).toBe('4.50');
    expect(response.body.data[0].delivery_time_days).toBe(5);
    expect(quotationService.listBuyerQuotations).toHaveBeenCalledWith(buyer.id, requestId);
  });

  it('lets buyers accept or reject and suppliers list their own quotations', async () => {
    authService.getActiveUser.mockResolvedValue(buyer);
    quotationService.acceptQuotation.mockResolvedValue({ id: quotationId, status: 'ACCEPTED' });
    quotationService.rejectQuotation.mockResolvedValue({ id: quotationId, status: 'REJECTED' });
    const accepted = await request(app)
      .post(`/api/quotations/${quotationId}/accept`)
      .set('Authorization', `Bearer ${tokenFor(buyer)}`);
    const rejected = await request(app)
      .post(`/api/quotations/${quotationId}/reject`)
      .set('Authorization', `Bearer ${tokenFor(buyer)}`);

    expect(accepted.status).toBe(200);
    expect(accepted.body.data.status).toBe('ACCEPTED');
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe('REJECTED');

    authService.getActiveUser.mockResolvedValue(supplier);
    quotationService.listSupplierQuotations.mockResolvedValue({
      data: [{ id: quotationId, status: 'SUBMITTED' }],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    const supplierList = await request(app)
      .get('/api/quotations?status=SUBMITTED')
      .set('Authorization', `Bearer ${tokenFor(supplier)}`);
    expect(supplierList.status).toBe(200);
    expect(supplierList.body.total).toBe(1);
    expect(quotationService.listSupplierQuotations).toHaveBeenCalledWith(
      supplier.id,
      expect.objectContaining({ status: 'SUBMITTED' })
    );
  });

  it('denies suppliers buyer-only accept operations', async () => {
    authService.getActiveUser.mockResolvedValue(supplier);
    const response = await request(app)
      .post(`/api/quotations/${quotationId}/accept`)
      .set('Authorization', `Bearer ${tokenFor(supplier)}`);

    expect(response.status).toBe(403);
    expect(quotationService.acceptQuotation).not.toHaveBeenCalled();
  });
});
