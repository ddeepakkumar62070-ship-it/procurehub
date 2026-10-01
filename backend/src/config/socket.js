const { Server } = require('socket.io');

let io;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    socket.on('join-room', (room) => {
      socket.join(room);
    });

    socket.on('disconnect', () => {
      // intentionally empty: socket cleanup handled by framework
    });
  });

  return io;
}

function getIo() {
  return io;
}

module.exports = {
  initSocket,
  getIo,
};
