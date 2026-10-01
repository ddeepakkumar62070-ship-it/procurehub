const env = require('../config/env');
const authService = require('../services/authService');
const { successResponse } = require('../utils/response');

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: env.refreshTokenExpiresInDays * 24 * 60 * 60 * 1000,
  };
}

function setRefreshCookie(res, token) {
  res.cookie(env.refreshCookieName, token, refreshCookieOptions());
}

function clearRefreshCookie(res) {
  const options = refreshCookieOptions();
  delete options.maxAge;
  res.clearCookie(env.refreshCookieName, options);
}

function sendAuthResult(res, result, statusCode = 200) {
  setRefreshCookie(res, result.refreshToken);
  return res.status(statusCode).json(successResponse({
    accessToken: result.accessToken,
    user: result.user,
  }));
}

async function register(req, res) {
  const result = await authService.register(req.body);
  return sendAuthResult(res, result, 201);
}

async function login(req, res) {
  const result = await authService.login(req.body.email, req.body.password);
  return sendAuthResult(res, result);
}

async function refresh(req, res) {
  const result = await authService.refresh(req.cookies[env.refreshCookieName]);
  return sendAuthResult(res, result);
}

async function logout(req, res) {
  await authService.logout(req.cookies[env.refreshCookieName]);
  clearRefreshCookie(res);
  return res.status(200).json(successResponse({ loggedOut: true }));
}

async function me(req, res) {
  return res.status(200).json(successResponse({
    id: req.user.id,
    email: req.user.email,
    firstName: req.user.first_name,
    lastName: req.user.last_name,
    phone: req.user.phone,
    roles: req.user.roles,
  }));
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
  refreshCookieOptions,
};
