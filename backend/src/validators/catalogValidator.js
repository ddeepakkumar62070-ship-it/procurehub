const { z } = require('zod');

const uuidSchema = z.string().uuid();
const currencySchema = z.string().regex(/^[A-Z]{3}$/);

const categoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  parentCategoryId: uuidSchema.nullable().optional(),
}).strict();

const categoryUpdateSchema = categoryCreateSchema.partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one category field must be provided',
  });

const productCreateSchema = z.object({
  categoryId: uuidSchema,
  name: z.string().trim().min(2).max(200),
  sku: z.string().trim().min(1).max(100),
  description: z.string().trim().max(5000).nullable().optional(),
}).strict();

const productUpdateSchema = productCreateSchema.partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one product field must be provided',
  });

const supplierProductCreateSchema = z.object({
  productId: uuidSchema,
  unitPrice: z.number().finite().min(0).max(9999999999.99),
  currency: currencySchema,
  leadTimeDays: z.number().int().min(0).max(3650).nullable().optional(),
  totalQuantity: z.number().int().min(0).max(2147483647),
  reorderLevel: z.number().int().min(0).max(2147483647).default(0),
}).strict();

const supplierProductUpdateSchema = z.object({
  unitPrice: z.number().finite().min(0).max(9999999999.99).optional(),
  currency: currencySchema.optional(),
  leadTimeDays: z.number().int().min(0).max(3650).nullable().optional(),
  isActive: z.boolean().optional(),
}).strict().refine((input) => Object.keys(input).length > 0, {
  message: 'At least one supplier product field must be provided',
});

const inventoryUpdateSchema = z.object({
  totalQuantity: z.number().int().min(0).max(2147483647).optional(),
  reorderLevel: z.number().int().min(0).max(2147483647).optional(),
}).strict().refine((input) => Object.keys(input).length > 0, {
  message: 'At least one inventory field must be provided',
});

const productListQuerySchema = z.object({
  keyword: z.string().trim().max(120).optional(),
  category: uuidSchema.optional(),
  supplier: uuidSchema.optional(),
  minPrice: z.coerce.number().finite().min(0).optional(),
  maxPrice: z.coerce.number().finite().min(0).optional(),
  currency: currencySchema.optional(),
  availability: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['name', 'price_asc', 'price_desc', 'newest']).default('name'),
}).strict().refine(
  (query) => query.minPrice === undefined
    || query.maxPrice === undefined
    || query.minPrice <= query.maxPrice,
  { message: 'minPrice must not exceed maxPrice' }
).refine(
  (query) => (query.minPrice === undefined && query.maxPrice === undefined
    && !query.sort.startsWith('price_')) || query.currency !== undefined,
  { message: 'currency is required when filtering or sorting by price' }
);

const categoryIdParamSchema = z.object({ id: uuidSchema });
const productIdParamSchema = z.object({ id: uuidSchema });
const supplierProductIdParamSchema = z.object({ id: uuidSchema });
const inventorySupplierProductIdParamSchema = z.object({ supplierProductId: uuidSchema });

module.exports = {
  categoryCreateSchema,
  categoryUpdateSchema,
  productCreateSchema,
  productUpdateSchema,
  supplierProductCreateSchema,
  supplierProductUpdateSchema,
  inventoryUpdateSchema,
  productListQuerySchema,
  categoryIdParamSchema,
  productIdParamSchema,
  supplierProductIdParamSchema,
  inventorySupplierProductIdParamSchema,
};
