const analyticsService = require('../services/analyticsService');

async function mine(req, res) {
  return res.json({ success: true, data: await analyticsService.getForUser(req.user) });
}

module.exports = { mine };
