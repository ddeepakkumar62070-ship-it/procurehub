const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('./env');
const authService = require('../services/authService');

let io;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: env.corsOrigin,
      methods: ['GET', 'POST', 'PATCH'],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const authorization = socket.handshake.headers.authorization;
    const headerToken = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : null;
    const token = socket.handshake.auth?.token || headerToken;
    if (typeof token !== 'string' || !token) {
      return next(new Error('Authentication required'));
    }
    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    } catch {
      return next(new Error('Invalid or expired authentication token'));
    }
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') {
      return next(new Error('Invalid authentication token'));
    }
    try {
      const user = await authService.getActiveUser(payload.sub);
      if (user.supplier_suspended && user.roles.includes('SUPPLIER')) {
        return next(new Error('Supplier account is suspended'));
      }
      socket.data.userId = user.id;
      return next();
    } catch (error) {
      return next(error);
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
  });

  return io;
}

function getIo() {
  return io;
}

function disconnectUser(userId) {
  if (!io) return;
  io.in(`user:${userId}`).disconnectSockets(true);
}

module.exports = {
  initSocket,
  getIo,
  disconnectUser,
};
