const express = require('express');
const controller = require('../controllers/purchaseRequestController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validateMiddleware');
const { validateParams, validateQuery } = require('../middleware/validateQueryMiddleware');
const schemas = require('../validators/purchaseRequestValidator');

const router = express.Router();

router.use(requireAuth);

router.post(
  '/',
  requireRole('BUYER'),
  validateBody(schemas.createPurchaseRequestSchema),
  controller.create
);
router.get(
  '/',
  requireRole('BUYER'),
  validateQuery(schemas.buyerRequestListQuerySchema),
  controller.listMine
);
router.get(
  '/eligible',
  requireRole('SUPPLIER'),
  validateQuery(schemas.eligibleRequestListQuerySchema),
  controller.listEligible
);
router.get(
  '/eligible/:id',
  requireRole('SUPPLIER'),
  validateParams(schemas.requestIdParamSchema),
  controller.getEligible
);
router.post(
  '/:id/cancel',
  requireRole('BUYER'),
  validateParams(schemas.requestIdParamSchema),
  controller.cancel
);
router.get(
  '/:id',
  requireRole('BUYER'),
  validateParams(schemas.requestIdParamSchema),
  controller.getMine
);

module.exports = router;
