const { z } = require('zod');

const uuid = z.string().uuid().transform((id) => id.toLowerCase());
const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED']).optional(),
};

module.exports = {
  listQuery: z.object(pagination).strict(),
  idParams: z.object({ id: uuid }),
  create: z.object({
    orderId: uuid,
    type: z.enum([
      'ORDER_NOT_RECEIVED',
      'DAMAGED_PRODUCT',
      'WRONG_QUANTITY',
      'WRONG_PRODUCT',
      'PAYMENT_ISSUE',
      'OTHER',
    ]),
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(10).max(5000),
  }).strict(),
};
