const supplierService = require('../services/supplierService');

async function list(req, res) {
  return res.json({ success: true, ...(await supplierService.list(req.validatedQuery)) });
}

async function get(req, res) {
  return res.json({ success: true, data: await supplierService.get(req.validatedParams.id) });
}

module.exports = { list, get };
