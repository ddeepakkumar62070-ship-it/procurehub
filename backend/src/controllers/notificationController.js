const notificationService = require('../services/notificationService');

async function listMine(req, res) {
  const result = await notificationService.listForUser(req.user.id, req.validatedQuery);
  return res.status(200).json({
    success: true,
    ...result,
  });
}

async function markRead(req, res) {
  const notification = await notificationService.markRead(req.user.id, req.validatedParams.id);
  return res.status(200).json({ success: true, data: notification });
}

async function markAllRead(req, res) {
  const result = await notificationService.markAllRead(req.user.id);
  return res.status(200).json({ success: true, data: result });
}

module.exports = { listMine, markRead, markAllRead };
