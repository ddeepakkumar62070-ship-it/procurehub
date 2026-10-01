const express = require('express');
const profileController = require('../controllers/profileController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validateMiddleware');
const { profileUpdateSchema } = require('../validators/authValidator');

const router = express.Router();

router.use(requireAuth, requireRole('BUYER', 'SUPPLIER', 'ADMIN'));
router.get('/me', profileController.getMe);
router.patch('/me', validateBody(profileUpdateSchema), profileController.updateMe);

module.exports = router;
