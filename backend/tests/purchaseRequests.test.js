jest.mock('../src/services/authService', () => ({
  getActiveUser: jest.fn(),
}));

jest.mock('../src/services/purchaseRequestService', () => ({
  createPurchaseRequest: jest.fn(),
  listBuyerRequests: jest.fn(),
  getBuyerRequest: jest.fn(),
  cancelBuyerRequest: jest.fn(),
  listEligibleRequests: jest.fn(),
  getEligibleRequest: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const authService = require('../src/services/authService');
const purchaseRequestService = require('../src/services/purchaseRequestService');
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
const productId = 'e6b98e7c-e369-40c7-a165-b3026a2cdab4';

function tokenFor(user) {
  return jwt.sign({ sub: user.id }, env.jwtSecret, { algorithm: 'HS256' });
}

const validRequest = {
  title: 'Office supplies order',
  requiredDeliveryDate: '2099-05-10',
  deliveryLocation: {
    address: '12 Market Street',
    city: 'Pune',
    country: 'India',
  },
  notes: 'Please package items separately',
  items: [{ productId, quantity: 12 }],
};

describe('Purchase request routes', () => {
  afterEach(() => jest.clearAllMocks());

  it('creates a buyer purchase request with multiple items', async () => {
    authService.getActiveUser.mockResolvedValue(buyer);
    purchaseRequestService.createPurchaseRequest.mockResolvedValue({
      id: requestId,
      request_number: 'PR-20990510-00000001',
      ...validRequest,
      status: 'OPEN',
    });
    const response = await request(app)
      .post('/api/purchase-requests')
      .set('Authorization', `Bearer ${tokenFor(buyer)}`)
      .send({
        ...validRequest,
        items: [
          { productId, quantity: 12 },
          { productId: 'e6b98e7c-e369-40c7-a165-b3026a2cdab5', quantity: 4 },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('OPEN');
    expect(purchaseRequestService.createPurchaseRequest).toHaveBeenCalledWith(
      buyer.id,
      expect.objectContaining({ items: expect.arrayContaining([
        { productId, quantity: 12 },
      ]) })
    );
  });

  it('rejects invalid request dates, locations, quantities, and duplicate products', async () => {
    authService.getActiveUser.mockResolvedValue(buyer);
    const response = await request(app)
      .post('/api/purchase-requests')
      .set('Authorization', `Bearer ${tokenFor(buyer)}`)
      .send({
        ...validRequest,
        requiredDeliveryDate: '2024-02-30',
        deliveryLocation: { address: '', city: 'Pune', country: 'India' },
        items: [
          { productId, quantity: 0 },
          { productId, quantity: -1 },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(purchaseRequestService.createPurchaseRequest).not.toHaveBeenCalled();
  });

  it('rejects past delivery dates and malformed supplier filters', async () => {
    authService.getActiveUser.mockResolvedValue(buyer);
    const invalidDate = await request(app)
      .post('/api/purchase-requests')
      .set('Authorization', `Bearer ${tokenFor(buyer)}`)
      .send({ ...validRequest, requiredDeliveryDate: '2020-01-01' });
    expect(invalidDate.status).toBe(400);

    authService.getActiveUser.mockResolvedValue(supplier);
    const invalidFilter = await request(app)
      .get('/api/purchase-requests/eligible?category=not-a-uuid&limit=1000')
      .set('Authorization', `Bearer ${tokenFor(supplier)}`);
    expect(invalidFilter.status).toBe(400);
    expect(purchaseRequestService.listEligibleRequests).not.toHaveBeenCalled();
  });

  it('allows only buyers to create requests', async () => {
    authService.getActiveUser.mockResolvedValue(supplier);
    const response = await request(app)
      .post('/api/purchase-requests')
      .set('Authorization', `Bearer ${tokenFor(supplier)}`)
      .send(validRequest);

    expect(response.status).toBe(403);
    expect(purchaseRequestService.createPurchaseRequest).not.toHaveBeenCalled();
  });

  it('lists and opens requests for their owning buyer', async () => {
    authService.getActiveUser.mockResolvedValue(buyer);
    purchaseRequestService.listBuyerRequests.mockResolvedValue({
      data: [{ id: requestId, title: validRequest.title }],
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
    purchaseRequestService.getBuyerRequest.mockResolvedValue({
      id: requestId,
      items: [{ product_id: productId, quantity: 12 }],
    });

    const list = await request(app)
      .get('/api/purchase-requests?status=OPEN&page=1&limit=10')
      .set('Authorization', `Bearer ${tokenFor(buyer)}`);
    const detail = await request(app)
      .get(`/api/purchase-requests/${requestId}`)
      .set('Authorization', `Bearer ${tokenFor(buyer)}`);

    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(detail.status).toBe(200);
    expect(detail.body.data.items[0].quantity).toBe(12);
    expect(purchaseRequestService.getBuyerRequest).toHaveBeenCalledWith(buyer.id, requestId);
  });

  it('allows the buyer to cancel an open request', async () => {
    authService.getActiveUser.mockResolvedValue(buyer);
    purchaseRequestService.cancelBuyerRequest.mockResolvedValue({
      id: requestId,
      status: 'CANCELLED',
    });
    const response = await request(app)
      .post(`/api/purchase-requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${tokenFor(buyer)}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('CANCELLED');
    expect(purchaseRequestService.cancelBuyerRequest).toHaveBeenCalledWith(buyer.id, requestId);
  });

  it('lets suppliers filter and open only eligible requests', async () => {
    authService.getActiveUser.mockResolvedValue(supplier);
    purchaseRequestService.listEligibleRequests.mockResolvedValue({
      data: [{ id: requestId, title: validRequest.title }],
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
    purchaseRequestService.getEligibleRequest.mockResolvedValue({
      id: requestId,
      items: [{ product_id: productId, quantity: 12 }],
    });
    const list = await request(app)
      .get('/api/purchase-requests/eligible?keyword=office&deliveryBefore=2099-06-01&page=1&limit=10')
      .set('Authorization', `Bearer ${tokenFor(supplier)}`);
    const detail = await request(app)
      .get(`/api/purchase-requests/eligible/${requestId}`)
      .set('Authorization', `Bearer ${tokenFor(supplier)}`);

    expect(list.status).toBe(200);
    expect(purchaseRequestService.listEligibleRequests).toHaveBeenCalledWith(
      supplier.id,
      expect.objectContaining({ keyword: 'office', deliveryBefore: '2099-06-01' })
    );
    expect(detail.status).toBe(200);
    expect(purchaseRequestService.getEligibleRequest).toHaveBeenCalledWith(supplier.id, requestId);
  });

  it('does not let a supplier access buyer-owned request routes', async () => {
    authService.getActiveUser.mockResolvedValue(supplier);
    const response = await request(app)
      .get(`/api/purchase-requests/${requestId}`)
      .set('Authorization', `Bearer ${tokenFor(supplier)}`);

    expect(response.status).toBe(403);
    expect(purchaseRequestService.getBuyerRequest).not.toHaveBeenCalled();
  });
});
