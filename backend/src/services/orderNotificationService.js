const { query } = require('../config/db');
const { enqueuePaymentReminder } = require('../jobs/producers');

async function sendPaymentReminders() {
  const result = await query(
    `SELECT i.id, i.invoice_number, (i.total - i.amount_paid)::TEXT AS outstanding,
            i.currency, i.due_date,
            buyer.email AS buyer_email
     FROM invoices i
     JOIN users buyer ON buyer.id = i.buyer_id
     WHERE i.status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')
       AND (i.due_date <= CURRENT_DATE + INTERVAL '7 days')`
  );
  const today = new Date().toISOString().slice(0, 10);
  await Promise.all(result.rows.map((invoice) => enqueuePaymentReminder({
    to: invoice.buyer_email,
    subject: `Payment reminder for invoice ${invoice.invoice_number}`,
    text: `Invoice ${invoice.invoice_number} has an outstanding balance of ${invoice.outstanding} ${invoice.currency}. Due date: ${invoice.due_date}.`,
  }, `payment-reminder-${invoice.id}-${today}`)));
  return result.rowCount;
}

module.exports = {
  sendPaymentReminders,
};
