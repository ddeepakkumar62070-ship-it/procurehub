const { pool } = require('../config/db');
const { getQueue, QUEUE_NAMES } = require('../queues/queueRegistry');

async function addJob(client, { queueName, jobName, jobId, payload }) {
  await client.query(
    `INSERT INTO background_job_outbox (queue_name, job_name, job_id, payload)
     VALUES ($1, $2, $3, $4::JSONB)
     ON CONFLICT (queue_name, job_id) DO NOTHING`,
    [queueName, jobName, jobId, JSON.stringify(payload)]
  );
}

async function addOrderStatusNotifications(client, orderId, status) {
  const result = await client.query(
    `SELECT po.order_number, buyer.email AS buyer_email, supplier.email AS supplier_email
     FROM purchase_orders po
     JOIN users buyer ON buyer.id = po.buyer_user_id
     JOIN users supplier ON supplier.id = po.supplier_user_id
     WHERE po.id = $1`,
    [orderId]
  );
  const order = result.rows[0];
  if (!order) throw new Error(`Purchase order ${orderId} was not found for notification`);
  for (const to of [order.buyer_email, order.supplier_email].filter(Boolean)) {
    await addJob(client, {
      queueName: QUEUE_NAMES.emailNotifications,
      jobName: 'send-email-notification',
      jobId: `order-${orderId}-${status}-${to}`,
      payload: {
        to,
        subject: `Purchase order ${order.order_number}: ${status}`,
        text: `Purchase order ${order.order_number} is now ${status}.`,
      },
    });
  }
}

async function addInvoiceStatusNotifications(client, invoiceId, status) {
  const result = await client.query(
    `SELECT i.invoice_number, buyer.email AS buyer_email, supplier.email AS supplier_email
     FROM invoices i
     JOIN users buyer ON buyer.id = i.buyer_id
     JOIN users supplier ON supplier.id = i.supplier_id
     WHERE i.id = $1`,
    [invoiceId]
  );
  const invoice = result.rows[0];
  if (!invoice) throw new Error(`Invoice ${invoiceId} was not found for notification`);
  for (const to of [invoice.buyer_email, invoice.supplier_email].filter(Boolean)) {
    await addJob(client, {
      queueName: QUEUE_NAMES.emailNotifications,
      jobName: 'send-email-notification',
      jobId: `invoice-${invoiceId}-${status}-${to}`,
      payload: {
        to,
        subject: `Invoice ${invoice.invoice_number}: ${status}`,
        text: `Invoice ${invoice.invoice_number} status is ${status}.`,
      },
    });
  }
}

async function dispatchPendingJobs(batchSize = 25) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, queue_name, job_name, job_id, payload
       FROM background_job_outbox
       WHERE status = 'PENDING'
       ORDER BY created_at, id
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize]
    );
    for (const job of result.rows) {
      await getQueue(job.queue_name).add(job.job_name, job.payload, { jobId: job.job_id });
      await client.query(
        `UPDATE background_job_outbox
         SET status = 'PUBLISHED', published_at = NOW()
         WHERE id = $1`,
        [job.id]
      );
    }
    await client.query('COMMIT');
    return result.rowCount;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  addJob,
  addOrderStatusNotifications,
  addInvoiceStatusNotifications,
  dispatchPendingJobs,
};
