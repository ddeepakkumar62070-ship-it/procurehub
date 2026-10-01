const http = require('http');
const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { initSocket } = require('./config/socket');
const { connectRedis } = require('./config/redis');
const { query } = require('./config/db');
const { startQuotationExpiryWorker } = require('./workers/quotationExpiryWorker');
const { startBackgroundWorkers } = require('./workers/backgroundWorkers');

async function startServer() {
  try {
    const server = http.createServer(app);
    initSocket(server);

    await connectRedis();

    const result = await query('SELECT 1');
    if (result.rows[0]['?column?'] !== 1) {
      throw new Error('Database health check failed');
    }

    await startQuotationExpiryWorker();
    await startBackgroundWorkers();

    server.listen(env.port, () => {
      logger.info(`ProcureHub backend listening on http://localhost:${env.port}`);
    });
  } catch (error) {
    logger.error('Server startup failed', { error: error.message });
    process.exit(1);
  }
}

startServer();
