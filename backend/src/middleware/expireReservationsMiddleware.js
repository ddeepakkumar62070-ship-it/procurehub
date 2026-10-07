const env = require('../config/env');
const inventoryReservationService = require('../services/inventoryReservationService');

async function expireReservations(req, res, next) {
  if (env.nodeEnv !== 'test') {
    await inventoryReservationService.expireOverdueReservations();
  }
  return next();
}

module.exports = expireReservations;
