const env = require('../config/env');
const { ForbiddenError } = require('../utils/errors');

function requireAllowedOrigin(req, res, next) {
  const origin = req.get('origin');
  if (origin && !env.corsOrigins.includes(origin)) {
    return next(new ForbiddenError('Request origin is not allowed'));
  }
  return next();
}

module.exports = requireAllowedOrigin;
