const express = require('express');
const { successResponse } = require('../utils/response');

const router = express.Router();

router.get('/', (req, res) => {
  res.status(200).json(
    successResponse({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    })
  );
});

module.exports = router;
