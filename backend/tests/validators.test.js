const { registerSchema, loginSchema } = require('../src/validators/authValidator');
const {
  inventoryUpdateSchema,
  productListQuerySchema,
} = require('../src/validators/catalogValidator');
const {
  submitQuotationSchema,
} = require('../src/validators/quotationValidator');
const {
  createOrderSchema,
  idempotencyKeySchema,
  transitionOrderSchema,
} = require('../src/validators/orderValidator');

const uuid = 'e6b98e7c-e369-40c7-a165-b3026a2cdab1';

describe('request validator unit tests', () => {
  it('rejects admin role self-registration and unexpected properties', () => {
    const input = {
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      password: 'long-enough-password',
      role: 'ADMIN',
      businessName: 'Platform',
    };
    expect(registerSchema.safeParse(input).success).toBe(false);
    expect(registerSchema.safeParse({
      ...input,
      role: 'BUYER',
      isActive: true,
    }).success).toBe(false);
  });

  it('rejects credentials that exceed bcrypt byte limits', () => {
    expect(loginSchema.safeParse({
      email: 'buyer@example.com',
      password: 'é'.repeat(37),
    }).success).toBe(false);
  });

  it('rejects mass assignment of inventory quantities', () => {
    expect(inventoryUpdateSchema.safeParse({
      totalQuantity: 8,
      reservedQuantity: 0,
    }).success).toBe(false);
  });

  it('allows only supported product sort fields and safe paging values', () => {
    expect(productListQuerySchema.safeParse({
      page: '2',
      limit: '10',
      sort: 'price_asc',
      currency: 'USD',
    }).success).toBe(true);
    expect(productListQuerySchema.safeParse({ sort: 'price; DROP TABLE products' }).success).toBe(false);
  });

  it('rejects duplicate quotation items and future-invalid quotation dates', () => {
    const quote = {
      currency: 'USD',
      deliveryTimeDays: 4,
      validUntil: new Date(Date.now() + 60_000).toISOString(),
      items: [
        { purchaseRequestItemId: uuid, quantity: 1, unitPrice: 2.25 },
        { purchaseRequestItemId: uuid, quantity: 1, unitPrice: 2.25 },
      ],
    };
    expect(submitQuotationSchema.safeParse(quote).success).toBe(false);
    expect(submitQuotationSchema.safeParse({
      ...quote,
      validUntil: new Date(Date.now() - 60_000).toISOString(),
      items: [quote.items[0]],
    }).success).toBe(false);
  });

  it('requires valid order identifiers, idempotency keys, and known states', () => {
    expect(createOrderSchema.safeParse({ quotationId: uuid }).success).toBe(true);
    expect(idempotencyKeySchema.safeParse('order-key_1').success).toBe(true);
    expect(idempotencyKeySchema.safeParse('bad key').success).toBe(false);
    expect(transitionOrderSchema.safeParse({ status: 'SHIPPED' }).success).toBe(true);
    expect(transitionOrderSchema.safeParse({ status: 'HACKED' }).success).toBe(false);
  });
});
