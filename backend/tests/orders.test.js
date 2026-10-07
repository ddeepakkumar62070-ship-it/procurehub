jest.mock('../src/services/authService', () => ({
  getActiveUser: jest.fn(),
}));

jest.mock('../src/services/orderTransitionService', () => ({
  createFromAcceptedQuotation: jest.fn(),
  listPurchaseOrders: jest.fn(),
  getPurchaseOrder: jest.fn(),
  transitionPurchaseOrder: jest.fn(),
}));
jest.mock('../src/services/idempotencyService', () => ({
  executeIdempotently: jest.fn(),
}));
jest.mock('../src/services/quotationService', () => ({
  acceptQuotationInTransaction: jest.fn(),
  throwAcceptanceFailure: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const authService = require('../src/services/authService');
const orderTransitionService = require('../src/services/orderTransitionService');
const idempotencyService = require('../src/services/idempotencyService');
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
const orderId = 'e6b98e7c-e369-40c7-a165-b3026a2cdab3';

function tokenFor(user) {
  return jwt.sign({ sub: user.id }, env.jwtSecret, { algorithm: 'HS256' });
}

describe('Purchase order routes', () => {
  afterEach(() => jest.clearAllMocks());

  it('lists a buyer’s orders using validated filters and pagination', async () => {
    authService.getActiveUser.mockResolvedValue(buyer);
    orderTransitionService.listPurchaseOrders.mockResolvedValue({
      data: [{ id: orderId, status: 'PO_CREATED' }],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });

    const response = await request(app)
      .get('/api/orders?status=PO_CREATED&page=1')
      .set('Authorization', `Bearer ${tokenFor(buyer)}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].status).toBe('PO_CREATED');
    expect(orderTransitionService.listPurchaseOrders).toHaveBeenCalledWith(
      buyer,
      expect.objectContaining({ status: 'PO_CREATED', page: 1 })
    );
  });

  it('lets an order party submit a validated transition', async () => {
    authService.getActiveUser.mockResolvedValue(supplier);
    orderTransitionService.transitionPurchaseOrder.mockResolvedValue({
      id: orderId,
      status: 'CONFIRMED',
    });

    const response = await request(app)
      .post(`/api/orders/${orderId}/transitions`)
      .set('Authorization', `Bearer ${tokenFor(supplier)}`)
      .send({ status: 'CONFIRMED', reason: 'Order acknowledged' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('CONFIRMED');
    expect(orderTransitionService.transitionPurchaseOrder).toHaveBeenCalledWith(
      orderId,
      supplier,
      { status: 'CONFIRMED', reason: 'Order acknowledged' }
    );
  });

  it('accepts the frontend supplier RETURNED transition request at the order API endpoint', async () => {
    authService.getActiveUser.mockResolvedValue(supplier);
    orderTransitionService.transitionPurchaseOrder.mockResolvedValue({
      id: orderId,
      status: 'RETURNED',
    });

    const response = await request(app)
      .post(`/api/orders/${orderId}/transitions`)
      .set('Authorization', `Bearer ${tokenFor(supplier)}`)
      .send({ status: 'RETURNED', reason: 'Return received' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('RETURNED');
    expect(orderTransitionService.transitionPurchaseOrder).toHaveBeenCalledWith(
      orderId,
      supplier,
      { status: 'RETURNED', reason: 'Return received' }
    );
  });

  it('rejects arbitrary status updates and unsupported payload fields', async () => {
    authService.getActiveUser.mockResolvedValue(buyer);

    const response = await request(app)
      .post(`/api/orders/${orderId}/transitions`)
      .set('Authorization', `Bearer ${tokenFor(buyer)}`)
      .send({ status: 'SHIPPED', updated_at: 'now' });

    expect(response.status).toBe(400);
    expect(orderTransitionService.transitionPurchaseOrder).not.toHaveBeenCalled();
  });

  it('prevents users without order roles from listing orders', async () => {
    authService.getActiveUser.mockResolvedValue({ ...buyer, roles: ['ADMIN'] });

    const response = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${tokenFor(buyer)}`);

    expect(response.status).toBe(403);
    expect(orderTransitionService.listPurchaseOrders).not.toHaveBeenCalled();
  });

  it('creates an order through an idempotent request using the quotation acceptance flow', async () => {
    authService.getActiveUser.mockResolvedValue(buyer);
    idempotencyService.executeIdempotently.mockImplementation(async ({ operation, ...input }) => {
      expect(input).toMatchObject({
        userId: buyer.id,
        idempotencyKey: 'abc123',
        request: { quotationId: orderId },
      });
      const body = await operation({ query: jest.fn() });
      return { ...body, replayed: false };
    });
    quotationService.acceptQuotationInTransaction.mockResolvedValue({
      quotation: { id: orderId, status: 'ACCEPTED' },
      purchaseOrder: { id: 'new-order-id', status: 'PO_CREATED' },
    });

    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenFor(buyer)}`)
      .set('Idempotency-Key', 'abc123')
      .send({ quotationId: orderId });

    expect(response.status).toBe(201);
    expect(response.body.data.purchaseOrder.id).toBe('new-order-id');
    expect(quotationService.acceptQuotationInTransaction).toHaveBeenCalledWith(
      expect.any(Object),
      buyer.id,
      orderId
    );
  });

  it('requires an Idempotency-Key for order creation', async () => {
    authService.getActiveUser.mockResolvedValue(buyer);
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenFor(buyer)}`)
      .send({ quotationId: orderId });

    expect(response.status).toBe(400);
    expect(idempotencyService.executeIdempotently).not.toHaveBeenCalled();
  });
});
