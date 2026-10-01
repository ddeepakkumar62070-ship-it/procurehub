const { z } = require('zod');

const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, {
    message: 'Password must be no more than 72 UTF-8 bytes',
  });

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: passwordSchema,
  role: z.enum(['BUYER', 'SUPPLIER']),
  businessName: z.string().trim().min(2).max(200),
}).strict();

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).refine((password) => Buffer.byteLength(password, 'utf8') <= 72, {
    message: 'Password must be no more than 72 UTF-8 bytes',
  }),
}).strict();

const profileUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  businessName: z.string().trim().min(2).max(200).optional(),
  registrationNumber: z.string().trim().max(100).nullable().optional(),
  taxId: z.string().trim().max(100).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  country: z.string().trim().max(100).nullable().optional(),
  preferredCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  leadTimeDays: z.number().int().min(0).max(3650).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'At least one profile field must be provided',
});

module.exports = {
  registerSchema,
  loginSchema,
  profileUpdateSchema,
};
