jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn() },
  query: jest.fn(),
}));
jest.mock('../src/services/jobOutboxService', () => ({
  addJob: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/config/socket', () => ({
  getIo: jest.fn(),
}));

const { pool, query } = require('../src/config/db');
const jobOutboxService = require('../src/services/jobOutboxService');
const { getIo } = require('../src/config/socket');
const notificationService = require('../src/services/notificationService');

describe('NotificationService', () => {
  afterEach(() => jest.clearAllMocks());

  it('persists typed notifications and schedules socket delivery in the same transaction', async () => {
    const client = { query: jest.fn() };
    const notification = {
      id: 'notification-id',
      user_id: 'user-id',
      type: 'NEW_PURCHASE_REQUEST',
      title: 'New request',
      message: 'A request is ready.',
      data: { purchaseRequestId: 'request-id' },
    };
    client.query.mockResolvedValueOnce({ rows: [notification] });

    await expect(notificationService.createInTransaction(client, {
      ...notification,
      userId: notification.user_id,
      dedupeKey: 'request-id',
    })).resolves.toEqual(notification);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notifications'),
      expect.arrayContaining(['user-id', 'NEW_PURCHASE_REQUEST'])
    );
    expect(jobOutboxService.addJob).toHaveBeenCalledWith(client, expect.objectContaining({
      queueName: 'notification-delivery',
      jobName: 'deliver-notification',
      payload: { notificationId: notification.id },
    }));
    expect(notificationService.NOTIFICATION_TYPES).toHaveLength(10);
  });

  it('delivers persisted notifications only to their authenticated user room', async () => {
    const notification = { id: 'notification-id', user_id: 'user-id', type: 'LOW_STOCK' };
    query.mockResolvedValueOnce({ rows: [notification] });
    const room = { emit: jest.fn() };
    getIo.mockReturnValue({ to: jest.fn().mockReturnValue(room) });

    await expect(notificationService.deliver(notification.id)).resolves.toEqual(notification);

    expect(getIo().to).toHaveBeenCalledWith('user:user-id');
    expect(room.emit).toHaveBeenCalledWith('notification:new', notification);
  });

  it('marks a notification read only when it belongs to the requesting user', async () => {
    const notification = { id: 'notification-id', read_at: '2026-10-02T00:00:00.000Z' };
    query.mockResolvedValueOnce({ rows: [notification] });

    await expect(notificationService.markRead('user-id', notification.id)).resolves.toEqual(notification);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND user_id = $2'),
      [notification.id, 'user-id']
    );
  });
});
