const { z } = require('zod');

const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
}).strict();

const notificationIdParamSchema = z.object({
  id: z.string().uuid().transform((value) => value.toLowerCase()),
});

module.exports = { notificationListQuerySchema, notificationIdParamSchema };
