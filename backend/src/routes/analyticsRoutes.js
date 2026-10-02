const express = require('express');
const controller = require('../controllers/analyticsController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
router.get('/me', requireAuth, requireRole('BUYER', 'SUPPLIER', 'ADMIN'), controller.mine);

module.exports = router;
