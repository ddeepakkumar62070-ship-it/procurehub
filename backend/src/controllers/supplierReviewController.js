const supplierReviewService = require('../services/supplierReviewService');

async function create(req, res) {
  const review = await supplierReviewService.create(req.validatedParams.id, req.user, req.body);
  return res.status(201).json({ success: true, data: review });
}

async function getForOrder(req, res) {
  const review = await supplierReviewService.getForOrder(req.validatedParams.id, req.user);
  return res.status(200).json({ success: true, data: review });
}

async function listMine(req, res) {
  const reviews = await supplierReviewService.listMine(req.user);
  return res.status(200).json({ success: true, data: reviews });
}

async function listForSupplier(req, res) {
  const reviews = await supplierReviewService.listForSupplier(req.validatedParams.id);
  return res.status(200).json({ success: true, data: reviews });
}

module.exports = { create, getForOrder, listMine, listForSupplier };
