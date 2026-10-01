const authService = require('../services/authService');
const { successResponse } = require('../utils/response');

async function getMe(req, res) {
  const profile = await authService.getProfile(req.user.id);
  return res.status(200).json(successResponse(profile));
}

async function updateMe(req, res) {
  const profile = await authService.updateProfile(req.user, req.body);
  return res.status(200).json(successResponse(profile));
}

module.exports = {
  getMe,
  updateMe,
};
