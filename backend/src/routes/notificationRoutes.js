const express = require('express');
const controller = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateParams, validateQuery } = require('../middleware/validateQueryMiddleware');
const schemas = require('../validators/notificationValidator');

const router = express.Router();

router.use(requireAuth);
router.get('/', validateQuery(schemas.notificationListQuerySchema), controller.listMine);
router.patch('/read-all', controller.markAllRead);
router.patch('/:id/read', validateParams(schemas.notificationIdParamSchema), controller.markRead);

module.exports = router;
