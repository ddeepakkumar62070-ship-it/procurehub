const purchaseRequestService = require('../services/purchaseRequestService');

function paginatedResponse(result) {
  return {
    success: true,
    data: result.data,
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  };
}

async function create(req, res) {
  const result = await purchaseRequestService.createPurchaseRequest(req.user.id, req.body);
  return res.status(201).json({ success: true, data: result });
}

async function listMine(req, res) {
  const result = await purchaseRequestService.listBuyerRequests(req.user.id, req.validatedQuery);
  return res.status(200).json(paginatedResponse(result));
}

async function getMine(req, res) {
  const result = await purchaseRequestService.getBuyerRequest(
    req.user.id,
    req.validatedParams.id
  );
  return res.status(200).json({ success: true, data: result });
}

async function cancel(req, res) {
  const result = await purchaseRequestService.cancelBuyerRequest(
    req.user.id,
    req.validatedParams.id
  );
  return res.status(200).json({ success: true, data: result });
}

async function listEligible(req, res) {
  const result = await purchaseRequestService.listEligibleRequests(
    req.user.id,
    req.validatedQuery
  );
  return res.status(200).json(paginatedResponse(result));
}

async function getEligible(req, res) {
  const result = await purchaseRequestService.getEligibleRequest(
    req.user.id,
    req.validatedParams.id
  );
  return res.status(200).json({ success: true, data: result });
}

module.exports = {
  create,
  listMine,
  getMine,
  cancel,
  listEligible,
  getEligible,
};
