const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const logger = require('./config/logger');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const catalogRoutes = require('./routes/catalogRoutes');
const supplierProductRoutes = require('./routes/supplierProductRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const purchaseRequestRoutes = require('./routes/purchaseRequestRoutes');
const quotationRoutes = require('./routes/quotationRoutes');
const orderRoutes = require('./routes/orderRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const errorMiddleware = require('./middleware/errorMiddleware');
const rateLimit = require('./middleware/rateLimitMiddleware');

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
app.use(cookieParser());

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to ProcureHub API' });
});

app.use('/api/health', healthRoutes);
app.use('/api', rateLimit());
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/supplier-products', supplierProductRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/purchase-requests', purchaseRequestRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/invoices', invoiceRoutes);

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
