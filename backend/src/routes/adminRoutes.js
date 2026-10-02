const express = require('express');
const controller = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validateMiddleware');
const { validateParams, validateQuery } = require('../middleware/validateQueryMiddleware');
const schemas = require('../validators/adminValidator');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN'));
router.get('/dashboard', controller.dashboard);
router.get('/users', validateQuery(schemas.usersQuery), controller.users);
router.patch(
  '/users/:id',
  validateParams(schemas.idParams),
  validateBody(schemas.updateUserSchema),
  controller.updateUser
);
router.get('/suppliers', validateQuery(schemas.standardQuery), controller.suppliers);
router.patch(
  '/suppliers/:id',
  validateParams(schemas.idParams),
  validateBody(schemas.updateSupplierSchema),
  controller.updateSupplier
);
router.get('/orders', validateQuery(schemas.orderQuery), controller.orders);
router.get('/orders/:id', validateParams(schemas.idParams), controller.order);
router.get('/audit-logs', validateQuery(schemas.auditQuery), controller.auditLogs);
router.get('/disputes', validateQuery(schemas.disputeQuery), controller.disputes);
router.patch(
  '/disputes/:id',
  validateParams(schemas.idParams),
  validateBody(schemas.updateDisputeSchema),
  controller.updateDispute
);

module.exports = router;
