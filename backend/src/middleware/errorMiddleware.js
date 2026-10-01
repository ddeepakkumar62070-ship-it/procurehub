const { errorResponse } = require('../utils/response');

function errorMiddleware(err, req, res, next) {
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
