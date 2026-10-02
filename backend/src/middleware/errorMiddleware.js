const { errorResponse } = require('../utils/response');
const { ZodError } = require('zod');
const { AppError } = require('../utils/errors');

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

  const malformedJson = err.type === 'entity.parse.failed';
  const knownError = err instanceof AppError;
  const statusCode = knownError ? err.statusCode : malformedJson ? 400 : 500;
  const code = knownError ? err.code : malformedJson ? 'INVALID_JSON' : 'INTERNAL_SERVER_ERROR';
  const message = knownError ? err.message : malformedJson ? 'Malformed JSON request' : 'Something went wrong';

  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack || err);
  }

  return res.status(statusCode).json(
    errorResponse(message, code, knownError ? err.details || null : null)
  );
}

module.exports = errorMiddleware;
