const express = require('express');
const controller = require('../controllers/invoiceController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validateMiddleware');
const { validateParams, validateQuery } = require('../middleware/validateQueryMiddleware');
const schemas = require('../validators/invoiceValidator');

const router = express.Router();

router.use(requireAuth, requireRole('BUYER', 'SUPPLIER'));
router.get('/', validateQuery(schemas.invoiceListQuerySchema), controller.listMine);
router.get('/:id/pdf', validateParams(schemas.invoiceIdParamSchema), controller.getPdf);
router.get('/:id', validateParams(schemas.invoiceIdParamSchema), controller.getOne);
router.post(
  '/:id/payments',
  requireRole('BUYER'),
  validateParams(schemas.invoiceIdParamSchema),
  validateBody(schemas.payInvoiceSchema),
  controller.pay
);

module.exports = router;
