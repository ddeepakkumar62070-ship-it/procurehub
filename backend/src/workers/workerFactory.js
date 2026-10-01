const { Worker } = require('bullmq');
const logger = require('../config/logger');
const { connection, getQueue, queueDefaults, QUEUE_NAMES } = require('../queues/queueRegistry');
const { enqueueBestEffort } = require('../jobs/producers');

const retryDelays = [5000, 30000, 120000];

function backoffStrategy(attemptsMade, type) {
  if (type !== 'procurehub') return -1;
  const retryIndex = Math.max(0, Math.min(attemptsMade - 1, retryDelays.length - 1));
  return retryDelays[retryIndex];
}

function createWorker(queueName, processor) {
  const worker = new Worker(queueName, processor, {
    connection,
    settings: {
      backoffStrategy,
    },
  });

  worker.on('error', (error) => {
    logger.error('BullMQ worker error', { queue: queueName, error: error.message });
  });
  worker.on('failed', (job, error) => {
    const attempts = queueName === QUEUE_NAMES.deadLetter
      ? 1
      : (job?.opts.attempts || queueDefaults.attempts);
    if (!job || job.attemptsMade < attempts) return;
    logger.error('Background job exhausted retries; retained in failed set', {
      queue: queueName,
      jobId: job.id,
      jobName: job.name,
      attempts: job.attemptsMade,
      error: error.message,
    });
    if (queueName === QUEUE_NAMES.deadLetter) return;
    void enqueueBestEffort(
      QUEUE_NAMES.deadLetter,
      'record-dead-letter',
      {
        sourceQueue: queueName,
        sourceJobId: job.id,
        jobName: job.name,
        attempts: job.attemptsMade,
        reason: error.message,
        failedAt: new Date().toISOString(),
      },
      `${queueName}-${job.id}`
    );
  });
  return worker;
}

async function startWorker(queueName, processor) {
  const worker = createWorker(queueName, processor);
  await worker.waitUntilReady();
  return worker;
}

async function schedule(queueName, schedulerId, jobName, every) {
  await getQueue(queueName).upsertJobScheduler(
    schedulerId,
    { every },
    {
      name: jobName,
      data: {},
      opts: { attempts: 4, backoff: { type: 'procurehub' }, removeOnFail: false },
    }
  );
}

module.exports = { createWorker, startWorker, schedule, retryDelays, backoffStrategy };
