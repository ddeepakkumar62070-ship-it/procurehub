const z = require('zod');

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
}).strict();

module.exports = {
  listQuery,
  idParams: z.object({ id: z.string().uuid().transform((id) => id.toLowerCase()) }),
};
