const logger = require('../config/logger');

async function sendNotification({ to, subject, text }) {
  if (!to || !subject || !text) {
    throw new Error('Email notification requires recipient, subject, and text');
  }
  logger.info('Simulated email notification processed', { to, subject });
  return { accepted: true, transport: 'SIMULATED' };
}

module.exports = { sendNotification };
