const { z } = require('zod');

const uuidSchema = z.string().uuid().transform((value) => value.toLowerCase());

const deliveryLocationSchema = z.object({
  address: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().max(100).optional(),
  country: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().max(32).optional(),
}).strict();

const createPurchaseRequestSchema = z.object({
  title: z.string().trim().min(3).max(200),
  requiredDeliveryDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format')
    .refine((value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
    }, 'Enter a valid calendar date')
    .refine((value) => value >= new Date().toISOString().slice(0, 10), {
      message: 'Required delivery date cannot be in the past',
    }),
  deliveryLocation: deliveryLocationSchema,
  notes: z.string().trim().max(5000).nullable().optional(),
  items: z.array(z.object({
    productId: uuidSchema,
    quantity: z.number().int().min(1).max(2147483647),
  }).strict()).min(1).max(100),
}).strict().superRefine((input, context) => {
  const productIds = new Set();
  input.items.forEach((item, index) => {
    if (productIds.has(item.productId)) {
      context.addIssue({
        code: 'custom',
        path: ['items', index, 'productId'],
        message: 'Each product can only appear once; combine its quantity',
      });
    }
    productIds.add(item.productId);
  });
});

const buyerRequestListQuerySchema = z.object({
  status: z.enum(['OPEN', 'QUOTATION_RECEIVED', 'QUOTATION_ACCEPTED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const eligibleRequestListQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(120).optional(),
  category: uuidSchema.optional(),
  deliveryBefore: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .refine((value) => value === undefined || (
      !Number.isNaN(new Date(`${value}T00:00:00.000Z`).valueOf())
      && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
    ), 'Enter a valid delivery date'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const requestIdParamSchema = z.object({ id: uuidSchema });

module.exports = {
  createPurchaseRequestSchema,
  buyerRequestListQuerySchema,
  eligibleRequestListQuerySchema,
  requestIdParamSchema,
};
