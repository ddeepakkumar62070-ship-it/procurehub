const { z } = require('zod');

const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const createSupplierReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().trim().min(1).max(2000).optional(),
}).strict();

module.exports = { orderIdParamSchema: z.object({ id: uuid }), createSupplierReviewSchema };
