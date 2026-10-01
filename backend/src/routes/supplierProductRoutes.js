const express = require('express');
const catalogController = require('../controllers/catalogController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validateMiddleware');
const { validateParams } = require('../middleware/validateQueryMiddleware');
const schemas = require('../validators/catalogValidator');

const router = express.Router();

router.use(requireAuth, requireRole('SUPPLIER'));
router.get('/mine', catalogController.listSupplierProducts);
router.post(
  '/',
  validateBody(schemas.supplierProductCreateSchema),
  catalogController.createSupplierProduct
);
router.patch(
  '/:id',
  validateParams(schemas.supplierProductIdParamSchema),
  validateBody(schemas.supplierProductUpdateSchema),
  catalogController.updateSupplierProduct
);

module.exports = router;
