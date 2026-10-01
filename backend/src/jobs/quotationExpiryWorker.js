const { Worker } = require('bullmq');
const logger = require('../config/logger');
const quotationService = require('../services/quotationService');
const { connection, queueName, quotationExpiryQueue } = require('../queues/quotationExpiryQueue');

async function startQuotationExpiryWorker() {
  const worker = new Worker(
    queueName,
    async () => {
      const expiredCount = await quotationService.expireOverdueQuotations();
      if (expiredCount > 0) {
        logger.info('Expired quotations processed', { count: expiredCount });
      }
      return { expiredCount };
    },
    { connection }
  );

  worker.on('error', (error) => {
    logger.error('Quotation expiry worker error', { error: error.message });
  });

  await worker.waitUntilReady();
  await quotationExpiryQueue.upsertJobScheduler(
    'quotation-expiry-sweep',
    { every: 30000 },
    {
      name: 'expire-overdue-quotations',
      data: {},
      opts: {
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    },
  );
  logger.info('Quotation expiry worker started');
  return worker;
}

module.exports = {
  startQuotationExpiryWorker,
};
