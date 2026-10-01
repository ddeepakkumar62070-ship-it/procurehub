const express = require('express');
const { z } = require('zod');
const catalogController = require('../controllers/catalogController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validateMiddleware');
const { validateParams, validateQuery } = require('../middleware/validateQueryMiddleware');
const schemas = require('../validators/catalogValidator');

const router = express.Router();

router.use(requireAuth, requireRole('SUPPLIER'));
router.get(
  '/low-stock',
  (req, res, next) => {
    req.validatedQuery = { lowStock: 'true' };
    next();
  },
  catalogController.listInventory
);
router.get(
  '/',
  validateQuery(z.object({ lowStock: z.enum(['true', 'false']).optional() }).strict()),
  catalogController.listInventory
);
router.patch(
  '/:supplierProductId',
  validateParams(schemas.inventorySupplierProductIdParamSchema),
  validateBody(schemas.inventoryUpdateSchema),
  catalogController.updateInventory
);

module.exports = router;
