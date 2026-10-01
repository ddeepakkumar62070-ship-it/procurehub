const { randomUUID } = require('crypto');

async function initiatePayment({ amount, currency }) {
  return {
    provider: 'SIMULATED',
    providerReference: `SIM-${randomUUID()}`,
    status: 'SUCCEEDED',
    amount,
    currency,
    metadata: { mode: 'simulated' },
  };
}

module.exports = { initiatePayment };
