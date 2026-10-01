const logger = require('../config/logger');
const env = require('../config/env');
const { getQueue, QUEUE_NAMES } = require('../queues/queueRegistry');

async function enqueue(name, jobName, data, jobId) {
  if (env.nodeEnv === 'test') return null;
  const queue = getQueue(name);
  const options = jobId ? { jobId } : {};
  return queue.add(jobName, data, options);
}

async function enqueueBestEffort(name, jobName, data, jobId) {
  try {
    return await enqueue(name, jobName, data, jobId);
  } catch (error) {
    logger.error('Unable to enqueue post-commit job', {
      queue: name,
      jobName,
      jobId: jobId || null,
      error: error.message,
    });
    return null;
  }
}

function enqueueLowStockAlert(data, jobId) {
  return enqueue(QUEUE_NAMES.lowStockAlerts, 'send-low-stock-alert', data, jobId);
}

function enqueuePaymentReminder(data, jobId) {
  return enqueue(QUEUE_NAMES.emailNotifications, 'send-payment-reminder', data, jobId);
}

module.exports = {
  enqueue,
  enqueueBestEffort,
  enqueueLowStockAlert,
  enqueuePaymentReminder,
  QUEUE_NAMES,
};
