const { createClient } = require('redis');
const env = require('./env');
const logger = require('./logger');

const redisClient = createClient({
  url: `redis://${env.redisHost}:${env.redisPort}`,
});

redisClient.on('error', (err) => {
  logger.error('Redis client error', { error: err.message });
});

redisClient.on('connect', () => {
  logger.info('Connected to Redis');
});

async function connectRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
  return redisClient;
}

module.exports = {
  redisClient,
  connectRedis,
};
