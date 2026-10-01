const { errorResponse } = require('../utils/response');
const { ZodError } = require('zod');

function errorMiddleware(err, req, res, next) {
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return res.status(400).json(
      errorResponse('Request validation failed', 'VALIDATION_ERROR', details)
    );
  }

  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'Something went wrong';

  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack || err);
  }

  return res.status(statusCode).json(
    errorResponse(message, code, err.details || null)
  );
}

module.exports = errorMiddleware;
