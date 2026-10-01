const orderTransitionService = require('../services/orderTransitionService');
const idempotencyService = require('../services/idempotencyService');
const quotationService = require('../services/quotationService');
const redisData = require('../config/redisData');
const schemas = require('../validators/orderValidator');

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

async function create(req, res) {
  const idempotencyKey = schemas.idempotencyKeySchema.parse(req.get('Idempotency-Key'));
  const result = await idempotencyService.executeIdempotently({
    userId: req.user.id,
    idempotencyKey,
    request: req.body,
    operation: async (client) => {
      const accepted = await quotationService.acceptQuotationInTransaction(
        client,
        req.user.id,
        req.body.quotationId
      );
      quotationService.throwAcceptanceFailure(accepted.failure);
      return {
        body: { success: true, data: { ...accepted.quotation, purchaseOrder: accepted.purchaseOrder } },
        statusCode: 201,
      };
    },
  });
  await redisData.invalidateReadCache();
  return res.status(result.statusCode).json(result.body);
}

module.exports = {
  create,
  listMine,
  getOne,
  transition,
};
