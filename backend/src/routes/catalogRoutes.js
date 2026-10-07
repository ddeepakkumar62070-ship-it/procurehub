const express = require('express');
const catalogController = require('../controllers/catalogController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validateMiddleware');
const { validateParams, validateQuery } = require('../middleware/validateQueryMiddleware');
const expireReservations = require('../middleware/expireReservationsMiddleware');
const schemas = require('../validators/catalogValidator');

const router = express.Router();

router.get('/categories', catalogController.listCategories);
router.post(
  '/categories',
  requireAuth,
  requireRole('ADMIN'),
  validateBody(schemas.categoryCreateSchema),
  catalogController.createCategory
);
router.patch(
  '/categories/:id',
  requireAuth,
  requireRole('ADMIN'),
  validateParams(schemas.categoryIdParamSchema),
  validateBody(schemas.categoryUpdateSchema),
  catalogController.updateCategory
);
router.delete(
  '/categories/:id',
  requireAuth,
  requireRole('ADMIN'),
  validateParams(schemas.categoryIdParamSchema),
  catalogController.deactivateCategory
);

router.get(
  '/products',
  expireReservations,
  validateQuery(schemas.productListQuerySchema),
  catalogController.listProducts
);
router.get(
  '/products/:id',
  expireReservations,
  validateParams(schemas.productIdParamSchema),
  catalogController.getProduct
);
router.post(
  '/products',
  requireAuth,
  requireRole('ADMIN'),
  validateBody(schemas.productCreateSchema),
  catalogController.createProduct
);
router.patch(
  '/products/:id',
  requireAuth,
  requireRole('ADMIN'),
  validateParams(schemas.productIdParamSchema),
  validateBody(schemas.productUpdateSchema),
  catalogController.updateProduct
);
router.delete(
  '/products/:id',
  requireAuth,
  requireRole('ADMIN'),
  validateParams(schemas.productIdParamSchema),
  catalogController.deactivateProduct
);

module.exports = router;
