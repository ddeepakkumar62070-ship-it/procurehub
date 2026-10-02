const disputeService = require('../services/disputeService');

async function create(req, res) {
  return res.status(201).json({
    success: true,
    data: await disputeService.create(req.user, req.body),
  });
}

async function list(req, res) {
  return res.json({ success: true, ...(await disputeService.list(req.user, req.validatedQuery)) });
}

module.exports = { create, list };
