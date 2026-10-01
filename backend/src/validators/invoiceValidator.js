const { z } = require('zod');

const uuidSchema = z.string().uuid().transform((value) => value.toLowerCase());

const invoiceListQuerySchema = z.object({
  status: z.enum([
    'UNPAID',
    'PAYMENT_INITIATED',
    'PAID',
    'PARTIALLY_PAID',
    'OVERDUE',
    'REFUNDED',
  ]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const invoiceIdParamSchema = z.object({ id: uuidSchema });

const payInvoiceSchema = z.object({
  amount: z.number().finite().positive().max(999999999999.99)
    .refine((amount) => Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-7, {
      message: 'Payment amount must have no more than two decimal places',
    })
    .optional(),
}).strict();

module.exports = {
  invoiceListQuerySchema,
  invoiceIdParamSchema,
  payInvoiceSchema,
};
