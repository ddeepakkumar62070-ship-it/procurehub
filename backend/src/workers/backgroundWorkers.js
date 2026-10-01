const { query } = require('../config/db');
const logger = require('../config/logger');
const invoiceService = require('../services/invoiceService');
const emailNotificationService = require('../services/emailNotificationService');
const orderNotificationService = require('../services/orderNotificationService');
const jobOutboxService = require('../services/jobOutboxService');
const { enqueueLowStockAlert } = require('../jobs/producers');
const { QUEUE_NAMES } = require('../queues/queueRegistry');
const { startWorker, schedule } = require('./workerFactory');

async function processLowStockSweep() {
  const result = await query(
    `SELECT i.id, i.available_quantity, i.reorder_level,
            p.name AS product_name, u.email
     FROM inventory i
     JOIN supplier_products sp ON sp.id = i.supplier_product_id
     JOIN products p ON p.id = sp.product_id
     JOIN users u ON u.id = sp.supplier_user_id
     WHERE i.available_quantity <= i.reorder_level
       AND sp.is_active = TRUE AND u.is_active = TRUE AND u.deleted_at IS NULL`
  );
  const day = new Date().toISOString().slice(0, 10);
  await Promise.all(result.rows.map((item) => enqueueLowStockAlert({
    to: item.email,
    subject: `Low stock alert: ${item.product_name}`,
    text: `${item.product_name} has ${item.available_quantity} available units; reorder level is ${item.reorder_level}.`,
  }, `low-stock-${item.id}-${day}`)));
  return result.rowCount;
}

async function startBackgroundWorkers() {
  const emailWorker = await startWorker(QUEUE_NAMES.emailNotifications, async (job) => {
    return emailNotificationService.sendNotification(job.data);
  });
  const invoiceWorker = await startWorker(QUEUE_NAMES.invoiceGeneration, async (job) => {
    if (job.name !== 'generate-invoice-pdf') throw new Error(`Unsupported invoice job: ${job.name}`);
    return invoiceService.generateInvoicePdf(job.data.invoiceId);
  });
  const lowStockWorker = await startWorker(QUEUE_NAMES.lowStockAlerts, async (job) => {
    if (job.name === 'send-low-stock-alert') {
      return emailNotificationService.sendNotification(job.data);
    }
    if (job.name === 'scan-low-stock') {
      const count = await processLowStockSweep();
      if (count) logger.info('Low-stock notifications enqueued', { count });
      return { count };
    }
    throw new Error(`Unsupported low-stock job: ${job.name}`);
  });
  const paymentReminderWorker = await startWorker(QUEUE_NAMES.paymentReminders, async (job) => {
    if (job.name !== 'send-payment-reminders') {
      throw new Error(`Unsupported payment reminder job: ${job.name}`);
    }
    const count = await orderNotificationService.sendPaymentReminders();
    return { count };
  });
  const deadLetterWorker = await startWorker(QUEUE_NAMES.deadLetter, async (job) => {
    logger.error('Dead-letter job recorded', job.data);
    return { recorded: true };
  });
  const outboxWorker = await startWorker(QUEUE_NAMES.outboxDispatcher, async (job) => {
    if (job.name !== 'dispatch-outbox') throw new Error(`Unsupported outbox job: ${job.name}`);
    const published = await jobOutboxService.dispatchPendingJobs();
    return { published };
  });

  await schedule(QUEUE_NAMES.lowStockAlerts, 'low-stock-sweep', 'scan-low-stock', 5 * 60 * 1000);
  await schedule(
    QUEUE_NAMES.paymentReminders,
    'payment-reminder-sweep',
    'send-payment-reminders',
    24 * 60 * 60 * 1000
  );
  await schedule(
    QUEUE_NAMES.outboxDispatcher,
    'background-job-outbox-dispatch',
    'dispatch-outbox',
    5000
  );
  await Promise.all([
    emailWorker.waitUntilReady(),
    invoiceWorker.waitUntilReady(),
    lowStockWorker.waitUntilReady(),
    paymentReminderWorker.waitUntilReady(),
    deadLetterWorker.waitUntilReady(),
    outboxWorker.waitUntilReady(),
  ]);
  logger.info('Background workers started');
  return [
    emailWorker,
    invoiceWorker,
    lowStockWorker,
    paymentReminderWorker,
    deadLetterWorker,
    outboxWorker,
  ];
}

module.exports = { startBackgroundWorkers, processLowStockSweep };
