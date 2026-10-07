jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn() },
  query: jest.fn(),
}));

const { query } = require('../src/config/db');
const notificationService = require('../src/services/notificationService');

describe('NotificationService', () => {
  afterEach(() => jest.clearAllMocks());

  it('persists typed notifications for retrieval through the REST API', async () => {
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
    expect(notificationService.NOTIFICATION_TYPES).toHaveLength(10);
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

  it('always scopes notification listing to the authenticated user', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'buyer-notification' }] });

    const result = await notificationService.listForUser('buyer-id', {
      page: 1,
      limit: 20,
      unreadOnly: false,
    });

    expect(result.data).toEqual([{ id: 'buyer-notification' }]);
    expect(query.mock.calls[0][0]).toContain('WHERE user_id = $1');
    expect(query.mock.calls[0][1]).toEqual(['buyer-id']);
    expect(query.mock.calls[1][0]).toContain('WHERE user_id = $1');
    expect(query.mock.calls[1][1]).toEqual(['buyer-id', 20, 0]);
  });
});
