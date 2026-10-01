const { connection, getQueue, QUEUE_NAMES } = require('./queueRegistry');

const queueName = QUEUE_NAMES.quotationExpiry;
const quotationExpiryQueue = getQueue(queueName);

module.exports = {
  queueName,
  connection,
  quotationExpiryQueue,
};
