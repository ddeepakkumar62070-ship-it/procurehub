const express = require('express');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validateMiddleware');
const { registerSchema, loginSchema } = require('../validators/authValidator');

const router = express.Router();

router.post('/register', validateBody(registerSchema), authController.register);
router.post('/login', validateBody(loginSchema), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);

module.exports = router;
