jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn() },
}));
jest.mock('../src/queues/queueRegistry', () => ({
  getQueue: jest.fn(),
}));

const { pool } = require('../src/config/db');
const { getQueue } = require('../src/queues/queueRegistry');
const jobOutboxService = require('../src/services/jobOutboxService');

describe('JobOutboxService', () => {
  let client;
  let queue;

  beforeEach(() => {
    client = { query: jest.fn(), release: jest.fn() };
    queue = { add: jest.fn().mockResolvedValue({ id: 'queued-job' }) };
    pool.connect.mockResolvedValue(client);
    getQueue.mockReturnValue(queue);
  });

  afterEach(() => jest.clearAllMocks());

  it('publishes pending jobs and marks them published in one DB transaction', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'outbox-1',
          queue_name: 'email-notifications',
          job_name: 'send-email-notification',
          job_id: 'email-1',
          payload: { to: 'buyer@example.com' },
        }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await expect(jobOutboxService.dispatchPendingJobs()).resolves.toBe(1);

    expect(queue.add).toHaveBeenCalledWith(
      'send-email-notification',
      { to: 'buyer@example.com' },
      { jobId: 'email-1' }
    );
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back the claim when Redis queue publishing fails', async () => {
    queue.add.mockRejectedValue(new Error('Redis unavailable'));
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'outbox-1',
          queue_name: 'email-notifications',
          job_name: 'send-email-notification',
          job_id: 'email-1',
          payload: {},
        }],
      })
      .mockResolvedValueOnce({});

    await expect(jobOutboxService.dispatchPendingJobs()).rejects.toThrow('Redis unavailable');

    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});
