const { Queue } = require('bullmq');
const env = require('../config/env');

const queueName = 'quotation-expiry';
const connection = {
  host: env.redisHost,
  port: env.redisPort,
  maxRetriesPerRequest: null,
};

const quotationExpiryQueue = new Queue(queueName, { connection });

module.exports = {
  queueName,
  connection,
  quotationExpiryQueue,
};
