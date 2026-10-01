const { redisClient } = require('./redis');
const logger = require('./logger');

const CACHE_VERSION_KEY = 'procurehub:cache-version';
const DEFAULT_TEMP_TTL_SECONDS = 15 * 60;

async function getCacheVersion() {
  if (!redisClient.isOpen) return null;
  try {
    return (await redisClient.get(CACHE_VERSION_KEY)) || '1';
  } catch (error) {
    logger.warn('Redis cache version lookup failed', { error: error.message });
    return null;
  }
}

async function getCachedJson(key) {
  if (!redisClient.isOpen) return null;
  try {
    const value = await redisClient.get(key);
    return value === null ? null : JSON.parse(value);
  } catch (error) {
    logger.warn('Redis cache read failed', { error: error.message });
    return null;
  }
}

async function setCachedJson(key, value, ttlSeconds) {
  if (!redisClient.isOpen) return;
  try {
    await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (error) {
    logger.warn('Redis cache write failed', { error: error.message });
  }
}

async function invalidateReadCache() {
  if (!redisClient.isOpen) return;
  try {
    await redisClient.incr(CACHE_VERSION_KEY);
  } catch (error) {
    logger.warn('Redis cache invalidation failed', { error: error.message });
  }
}

function temporaryKey(namespace, key) {
  return `procurehub:temporary:${namespace}:${key}`;
}

async function setTemporaryData(namespace, key, value, ttlSeconds = DEFAULT_TEMP_TTL_SECONDS) {
  if (!redisClient.isOpen) return false;
  await redisClient.set(temporaryKey(namespace, key), value, { EX: ttlSeconds });
  return true;
}

async function getTemporaryData(namespace, key) {
  if (!redisClient.isOpen) return null;
  return redisClient.get(temporaryKey(namespace, key));
}

async function deleteTemporaryData(namespace, key) {
  if (!redisClient.isOpen) return 0;
  return redisClient.del(temporaryKey(namespace, key));
}

module.exports = {
  getCacheVersion,
  getCachedJson,
  setCachedJson,
  invalidateReadCache,
  setTemporaryData,
  getTemporaryData,
  deleteTemporaryData,
};
