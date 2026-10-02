const express = require('express');
const controller = require('../controllers/disputeController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validateMiddleware');
const { validateQuery } = require('../middleware/validateQueryMiddleware');
const schemas = require('../validators/disputeValidator');

const router = express.Router();
router.use(requireAuth, requireRole('BUYER', 'SUPPLIER'));
router.get('/', validateQuery(schemas.listQuery), controller.list);
router.post('/', validateBody(schemas.create), controller.create);

module.exports = router;
