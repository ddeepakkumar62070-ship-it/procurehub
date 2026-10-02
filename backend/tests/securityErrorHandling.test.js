const errorMiddleware = require('../src/middleware/errorMiddleware');
const { AppError } = require('../src/utils/errors');

function responseMock() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('safe API error responses', () => {
  it('does not expose unexpected internal error messages or metadata', () => {
    const response = responseMock();
    const originalEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      errorMiddleware(
        Object.assign(new Error('password=secret database=private'), {
          statusCode: 500,
          code: 'PG_CONNECTION_FAILURE',
          details: { databasePassword: 'secret' },
        }),
        {},
        response,
        jest.fn()
      );
    } finally {
      process.env.NODE_ENV = originalEnvironment;
    }

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Something went wrong',
        details: null,
      },
    });
  });

  it('preserves safe application errors', () => {
    const response = responseMock();
    errorMiddleware(new AppError('Access denied', 403, 'FORBIDDEN'), {}, response, jest.fn());

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied', details: null },
    });
  });
});
