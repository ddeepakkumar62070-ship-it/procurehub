const { hashRequest } = require('../src/services/idempotencyService');
const {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} = require('../src/utils/errors');

describe('utility unit tests', () => {
  it('hashes equivalent objects consistently regardless of key insertion order', () => {
    expect(hashRequest({ quotationId: 'quote-1', options: { currency: 'USD', priority: 2 } }))
      .toBe(hashRequest({ options: { priority: 2, currency: 'USD' }, quotationId: 'quote-1' }));
    expect(hashRequest({ quotationId: 'quote-1' }))
      .not.toBe(hashRequest({ quotationId: 'quote-2' }));
  });

  it('exposes stable status and code metadata for application error types', () => {
    expect(new AppError('Internal').statusCode).toBe(500);
    expect(new ValidationError('Invalid').code).toBe('VALIDATION_ERROR');
    expect(new UnauthorizedError().statusCode).toBe(401);
    expect(new ForbiddenError().statusCode).toBe(403);
    expect(new NotFoundError().statusCode).toBe(404);
    expect(new ConflictError('Already exists').statusCode).toBe(409);
  });
});
