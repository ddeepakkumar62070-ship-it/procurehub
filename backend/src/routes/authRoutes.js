const express = require('express');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validateMiddleware');
const { registerSchema, loginSchema } = require('../validators/authValidator');
const createRateLimit = require('../middleware/rateLimitMiddleware');
const requireAllowedOrigin = require('../middleware/requireAllowedOrigin');

const router = express.Router();
const loginRateLimit = createRateLimit({ limit: 10, windowSeconds: 15 * 60 });

router.post('/register', validateBody(registerSchema), authController.register);
router.post('/login', validateBody(loginSchema), loginRateLimit, authController.login);
router.post('/refresh', requireAllowedOrigin, authController.refresh);
router.post('/logout', requireAllowedOrigin, authController.logout);
router.get('/me', requireAuth, authController.me);

module.exports = router;
