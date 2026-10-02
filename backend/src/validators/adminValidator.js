const { z } = require('zod');
const { ORDER_STATES } = require('../services/orderStateMachine');

const idParams = z.object({ id: z.string().uuid().transform((id) => id.toLowerCase()) });
const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
};
const usersQuery = z.object({
  ...pagination,
  role: z.enum(['BUYER', 'SUPPLIER', 'ADMIN']).optional(),
  active: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
}).strict();
const standardQuery = z.object(pagination).strict();
const orderQuery = z.object({
  ...pagination,
  status: z.enum(ORDER_STATES).optional(),
}).strict();
const auditQuery = z.object({
  ...pagination,
  status: z.enum(ORDER_STATES).optional(),
}).strict();
const disputeQuery = z.object({
  ...pagination,
  status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED']).optional(),
}).strict();
const updateUserSchema = z.object({ isActive: z.boolean() }).strict();
const updateSupplierSchema = z.object({
  verificationStatus: z.enum(['PENDING', 'VERIFIED', 'REJECTED']),
}).strict();
const updateDisputeSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'RESOLVED', 'REJECTED']),
  resolution: z.string().trim().min(5).max(4000).optional(),
}).strict().refine(
  (value) => !['RESOLVED', 'REJECTED'].includes(value.status) || Boolean(value.resolution),
  { message: 'Resolution notes are required to close a dispute', path: ['resolution'] }
);

module.exports = {
  idParams,
  usersQuery,
  standardQuery,
  orderQuery,
  auditQuery,
  disputeQuery,
  updateUserSchema,
  updateSupplierSchema,
  updateDisputeSchema,
};
