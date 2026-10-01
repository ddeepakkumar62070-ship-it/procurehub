const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const logger = require('./config/logger');
const healthRoutes = require('./routes/healthRoutes');
const errorMiddleware = require('./middleware/errorMiddleware');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to ProcureHub API' });
});

app.use('/api/health', healthRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
  });
});

app.use(errorMiddleware);

module.exports = app;
