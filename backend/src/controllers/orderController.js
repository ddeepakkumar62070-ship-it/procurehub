const orderTransitionService = require('../services/orderTransitionService');

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

async function listMine(req, res) {
  const result = await orderTransitionService.listPurchaseOrders(req.user, req.validatedQuery);
  return res.status(200).json(paginatedResponse(result));
}

async function getOne(req, res) {
  const result = await orderTransitionService.getPurchaseOrder(req.validatedParams.id, req.user);
  return res.status(200).json({ success: true, data: result });
}

async function transition(req, res) {
  const result = await orderTransitionService.transitionPurchaseOrder(
    req.validatedParams.id,
    req.user,
    req.body
  );
  return res.status(200).json({ success: true, data: result });
}

module.exports = {
  listMine,
  getOne,
  transition,
};
