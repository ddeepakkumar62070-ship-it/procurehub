const express = require('express');
const controller = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validateMiddleware');
const { validateParams, validateQuery } = require('../middleware/validateQueryMiddleware');
const schemas = require('../validators/adminValidator');
const catalogSchemas = require('../validators/catalogValidator');

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
router.get('/suppliers', validateQuery(schemas.suppliersQuery), controller.suppliers);
router.patch(
  '/suppliers/:id',
  validateParams(schemas.idParams),
  validateBody(schemas.updateSupplierSchema),
  controller.updateSupplier
);
router.patch(
  '/suppliers/:id/suspension',
  validateParams(schemas.idParams),
  validateBody(schemas.updateSupplierSuspensionSchema),
  controller.updateSupplierSuspension
);
router.get('/categories', controller.categories);
router.post(
  '/categories',
  validateBody(catalogSchemas.categoryCreateSchema),
  controller.createCategory
);
router.patch(
  '/categories/:id',
  validateParams(schemas.idParams),
  validateBody(catalogSchemas.categoryUpdateSchema),
  controller.updateCategory
);
router.delete(
  '/categories/:id',
  validateParams(schemas.idParams),
  controller.deactivateCategory
);
router.post(
  '/products',
  validateBody(catalogSchemas.productCreateSchema),
  controller.createProduct
);
router.patch(
  '/products/:id',
  validateParams(schemas.idParams),
  validateBody(catalogSchemas.productUpdateSchema),
  controller.updateProduct
);
router.delete(
  '/products/:id',
  validateParams(schemas.idParams),
  controller.deactivateProduct
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
