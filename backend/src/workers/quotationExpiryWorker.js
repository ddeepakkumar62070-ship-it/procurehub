const logger = require('../config/logger');
const quotationService = require('../services/quotationService');
const inventoryReservationService = require('../services/inventoryReservationService');
const { QUEUE_NAMES } = require('../queues/queueRegistry');
const { startWorker, schedule } = require('./workerFactory');
const redisData = require('../config/redisData');

async function startQuotationExpiryWorker() {
  const worker = await startWorker(QUEUE_NAMES.quotationExpiry, async () => {
    const expiredCount = await quotationService.expireOverdueQuotations();
    const expiredReservationCount = await inventoryReservationService.expireOverdueReservations();
    const expiringNotificationCount = await quotationService.notifyExpiringQuotations();
    if (expiredReservationCount > 0) await redisData.invalidateReadCache();
    if (expiredCount > 0 || expiredReservationCount > 0 || expiringNotificationCount > 0) {
      logger.info('Expired records processed', {
        quotations: expiredCount,
        purchaseOrders: expiredReservationCount,
        expiringNotifications: expiringNotificationCount,
      });
    }
    return { expiredCount, expiredReservationCount, expiringNotificationCount };
  });
  await schedule(
    QUEUE_NAMES.quotationExpiry,
    'quotation-expiry-sweep',
    'expire-overdue-quotations',
    30000
  );
  logger.info('Quotation expiry worker started');
  return worker;
}

module.exports = { startQuotationExpiryWorker };
