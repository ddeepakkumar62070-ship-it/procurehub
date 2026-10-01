const { z } = require('zod');
const { ORDER_STATES } = require('../services/orderStateMachine');

const uuidSchema = z.string().uuid().transform((value) => value.toLowerCase());

const orderIdParamSchema = z.object({ id: uuidSchema });

const createOrderSchema = z.object({
  quotationId: uuidSchema,
}).strict();

const idempotencyKeySchema = z.string()
  .regex(/^[A-Za-z0-9._~-]{1,128}$/, 'Provide a valid Idempotency-Key header');

const orderListQuerySchema = z.object({
  status: z.enum(ORDER_STATES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const transitionOrderSchema = z.object({
  status: z.enum(ORDER_STATES),
  reason: z.string().trim().max(2000).nullable().optional(),
}).strict();

module.exports = {
  orderIdParamSchema,
  createOrderSchema,
  idempotencyKeySchema,
  orderListQuerySchema,
  transitionOrderSchema,
};
