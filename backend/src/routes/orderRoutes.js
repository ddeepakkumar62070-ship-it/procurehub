const express = require('express');
const controller = require('../controllers/orderController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validateMiddleware');
const { validateParams, validateQuery } = require('../middleware/validateQueryMiddleware');
const expireReservations = require('../middleware/expireReservationsMiddleware');
const schemas = require('../validators/orderValidator');
const reviewController = require('../controllers/supplierReviewController');
const reviewSchemas = require('../validators/supplierReviewValidator');

const router = express.Router();

router.use(requireAuth, requireRole('BUYER', 'SUPPLIER'), expireReservations);
router.post(
  '/',
  requireRole('BUYER'),
  validateBody(schemas.createOrderSchema),
  controller.create
);
router.get('/', validateQuery(schemas.orderListQuerySchema), controller.listMine);
router.get('/:id', validateParams(schemas.orderIdParamSchema), controller.getOne);
router.get(
  '/:id/review',
  requireRole('BUYER'),
  validateParams(reviewSchemas.orderIdParamSchema),
  reviewController.getForOrder
);
router.post(
  '/:id/review',
  requireRole('BUYER'),
  validateParams(reviewSchemas.orderIdParamSchema),
  validateBody(reviewSchemas.createSupplierReviewSchema),
  reviewController.create
);
router.post(
  '/:id/transitions',
  validateParams(schemas.orderIdParamSchema),
  validateBody(schemas.transitionOrderSchema),
  controller.transition
);

module.exports = router;
