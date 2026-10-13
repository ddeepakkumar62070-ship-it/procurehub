const express = require('express');
const controller = require('../controllers/supplierController');
const reviewController = require('../controllers/supplierReviewController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { validateParams, validateQuery } = require('../middleware/validateQueryMiddleware');
const schemas = require('../validators/supplierValidator');

const router = express.Router();
router.get('/', validateQuery(schemas.listQuery), controller.list);
router.get('/mine/reviews', requireAuth, requireRole('SUPPLIER'), reviewController.listMine);
router.get('/:id/reviews', validateParams(schemas.idParams), reviewController.listForSupplier);
router.get('/:id', validateParams(schemas.idParams), controller.get);

module.exports = router;
