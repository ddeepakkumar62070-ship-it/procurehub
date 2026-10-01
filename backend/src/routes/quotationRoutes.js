const express = require('express');
const controller = require('../controllers/quotationController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validateMiddleware');
const { validateParams, validateQuery } = require('../middleware/validateQueryMiddleware');
const schemas = require('../validators/quotationValidator');

const router = express.Router();

router.use(requireAuth);
router.get(
  '/',
  requireRole('SUPPLIER'),
  validateQuery(schemas.supplierQuotationListQuerySchema),
  controller.listMine
);
router.get(
  '/:id',
  requireRole('BUYER', 'SUPPLIER'),
  validateParams(schemas.quotationIdParamSchema),
  controller.getOne
);
router.post(
  '/:id/accept',
  requireRole('BUYER'),
  validateParams(schemas.quotationIdParamSchema),
  controller.accept
);
router.post(
  '/:id/reject',
  requireRole('BUYER'),
  validateParams(schemas.quotationIdParamSchema),
  controller.reject
);

module.exports = router;
