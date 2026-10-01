const express = require('express');
const controller = require('../controllers/orderController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validateMiddleware');
const { validateParams, validateQuery } = require('../middleware/validateQueryMiddleware');
const schemas = require('../validators/orderValidator');

const router = express.Router();

router.use(requireAuth, requireRole('BUYER', 'SUPPLIER'));
router.post(
  '/',
  requireRole('BUYER'),
  validateBody(schemas.createOrderSchema),
  controller.create
);
router.get('/', validateQuery(schemas.orderListQuerySchema), controller.listMine);
router.get('/:id', validateParams(schemas.orderIdParamSchema), controller.getOne);
router.post(
  '/:id/transitions',
  validateParams(schemas.orderIdParamSchema),
  validateBody(schemas.transitionOrderSchema),
  controller.transition
);

module.exports = router;
