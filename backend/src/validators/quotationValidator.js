const { z } = require('zod');

const uuidSchema = z.string().uuid().transform((value) => value.toLowerCase());

const submitQuotationSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  deliveryTimeDays: z.number().int().min(0).max(3650),
  validUntil: z.string().datetime({ offset: true })
    .refine((value) => new Date(value).getTime() > Date.now(), {
      message: 'Quotation validity must be in the future',
    }),
  notes: z.string().trim().max(5000).nullable().optional(),
  items: z.array(z.object({
    purchaseRequestItemId: uuidSchema,
    quantity: z.number().int().min(1).max(2147483647),
    unitPrice: z.number().finite().min(0).max(9999999999.99)
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, {
        message: 'Unit price must have no more than two decimal places',
      }),
  }).strict()).min(1).max(100),
}).strict().superRefine((input, context) => {
  const requestItemIds = new Set();
  input.items.forEach((item, index) => {
    if (requestItemIds.has(item.purchaseRequestItemId)) {
      context.addIssue({
        code: 'custom',
        path: ['items', index, 'purchaseRequestItemId'],
        message: 'Each requested line item can only appear once',
      });
    }
    requestItemIds.add(item.purchaseRequestItemId);
  });
});

const quotationIdParamSchema = z.object({ id: uuidSchema });
const purchaseRequestIdParamSchema = z.object({ id: uuidSchema });

const supplierQuotationListQuerySchema = z.object({
  status: z.enum(['SUBMITTED', 'ACCEPTED', 'REJECTED', 'EXPIRED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

module.exports = {
  submitQuotationSchema,
  quotationIdParamSchema,
  purchaseRequestIdParamSchema,
  supplierQuotationListQuerySchema,
};
