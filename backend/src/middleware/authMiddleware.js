const jwt = require('jsonwebtoken');
const env = require('../config/env');
const authService = require('../services/authService');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');

async function requireAuth(req, res, next) {
  const authorization = req.get('authorization');
  const [scheme, token] = authorization ? authorization.split(' ') : [];

  if (scheme !== 'Bearer' || !token) {
    return next(new UnauthorizedError('A bearer access token is required'));
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') {
      throw new UnauthorizedError('Invalid access token');
    }

    req.user = await authService.getActiveUser(payload.sub);
    return next();
  } catch (error) {
    if (error instanceof UnauthorizedError) return next(error);
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('Invalid or expired access token'));
    }
    return next(error);
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!req.user.roles.some((role) => allowedRoles.includes(role))) {
      return next(new ForbiddenError('Your account does not have permission to access this resource'));
    }
    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
};
