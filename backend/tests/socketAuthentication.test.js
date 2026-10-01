jest.mock('../src/services/authService', () => ({
  getActiveUser: jest.fn(),
}));

const http = require('http');
const jwt = require('jsonwebtoken');
const { io: createClient } = require('socket.io-client');
const authService = require('../src/services/authService');
const env = require('../src/config/env');
const { initSocket, getIo } = require('../src/config/socket');

describe('Socket.IO notification authentication', () => {
  let server;
  let io;
  let port;

  beforeEach(async () => {
    server = http.createServer();
    io = initSocket(server);
    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;
  });

  afterEach(async () => {
    await new Promise((resolve) => io.close(resolve));
  });

  it('authenticates access tokens and maps clients only to their user room', async () => {
    const user = { id: 'user-1', roles: ['SUPPLIER'] };
    authService.getActiveUser.mockResolvedValue(user);
    const token = jwt.sign({ sub: user.id }, env.jwtSecret, { algorithm: 'HS256' });
    const client = createClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    });
    try {
      await new Promise((resolve, reject) => {
        client.once('connect', resolve);
        client.once('connect_error', reject);
      });
      expect(getIo().sockets.adapter.rooms.get(`user:${user.id}`).has(client.id)).toBe(true);
      client.emit('join-room', 'user:another-user');
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(getIo().sockets.adapter.rooms.get('user:another-user')?.has(client.id)).not.toBe(true);
      const notification = new Promise((resolve) => client.once('notification:new', resolve));
      getIo().to(`user:${user.id}`).emit('notification:new', { id: 'notice-1' });
      await expect(notification).resolves.toEqual({ id: 'notice-1' });
      expect(authService.getActiveUser).toHaveBeenCalledWith(user.id);
    } finally {
      client.disconnect();
    }
  });

  it('rejects sockets without a valid bearer token', async () => {
    const client = createClient(`http://localhost:${port}`, {
      auth: { token: 'invalid-token' },
      transports: ['websocket'],
      reconnection: false,
    });
    try {
      await expect(new Promise((resolve, reject) => {
        client.once('connect', resolve);
        client.once('connect_error', reject);
      })).rejects.toMatchObject({ message: 'Invalid or expired authentication token' });
    } finally {
      client.disconnect();
    }
  });
});
