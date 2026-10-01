const { Queue } = require('bullmq');
const env = require('../config/env');

const QUEUE_NAMES = {
  quotationExpiry: 'quotation-expiry',
  emailNotifications: 'email-notifications',
  invoiceGeneration: 'invoice-generation',
  lowStockAlerts: 'low-stock-alerts',
  paymentReminders: 'payment-reminders',
  outboxDispatcher: 'outbox-dispatcher',
  deadLetter: 'dead-letter',
};

const connection = {
  host: env.redisHost,
  port: env.redisPort,
  maxRetriesPerRequest: null,
};

const queueDefaults = {
  attempts: 4,
  backoff: { type: 'procurehub' },
  removeOnComplete: 500,
  removeOnFail: false,
};

const queues = new Map();

function getQueue(name) {
  if (!Object.values(QUEUE_NAMES).includes(name)) {
    throw new Error(`Unknown BullMQ queue: ${name}`);
  }
  if (!queues.has(name)) {
    queues.set(name, new Queue(name, {
      connection,
      defaultJobOptions: name === QUEUE_NAMES.deadLetter
        ? { removeOnComplete: 500, removeOnFail: false }
        : queueDefaults,
    }));
  }
  return queues.get(name);
}

module.exports = {
  QUEUE_NAMES,
  connection,
  queueDefaults,
  getQueue,
};
