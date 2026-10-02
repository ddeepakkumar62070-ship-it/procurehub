const { pool, query } = require('../config/db');
const { ConflictError, NotFoundError, ValidationError } = require('../utils/errors');
const env = require('../config/env');
const redisData = require('../config/redisData');

async function cacheReadThrough(key, load) {
  const version = await redisData.getCacheVersion();
  if (version !== null) {
    const cacheKey = `procurehub:cache:${version}:${key}`;
    const cached = await redisData.getCachedJson(cacheKey);
    if (cached !== null) return cached;
    const value = await load();
    await redisData.setCachedJson(cacheKey, value, env.cacheTtlSeconds);
    return value;
  }
  return load();
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function handleUniqueViolation(error, message) {
  if (error.code === '23505') {
    throw new ConflictError(message, 'CATALOG_ITEM_ALREADY_EXISTS');
  }
  if (error.code === '23503') {
    throw new ValidationError('A referenced category, product, or supplier does not exist');
  }
  throw error;
}

async function listCategories() {
  return cacheReadThrough('catalog:categories', async () => {
    const result = await query(
      `SELECT id, parent_category_id, name, slug, description
       FROM categories
       WHERE is_active = TRUE AND deleted_at IS NULL
       ORDER BY name`
    );
    return result.rows;
  });
}

async function createCategory(input) {
  try {
    const result = await query(
      `INSERT INTO categories (parent_category_id, name, slug, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, parent_category_id, name, slug, description`,
      [input.parentCategoryId || null, input.name, input.slug, input.description || null]
    );
    await redisData.invalidateReadCache();
    return result.rows[0];
  } catch (error) {
    handleUniqueViolation(error, 'A category with this slug already exists');
  }
}

async function updateCategory(id, input) {
  const fields = {
    parentCategoryId: 'parent_category_id',
    name: 'name',
    slug: 'slug',
    description: 'description',
  };
  const entries = Object.entries(input);
  const values = entries.map(([key]) => input[key] ?? null);
  const assignments = entries.map(
    ([key], index) => `${fields[key]} = $${index + 1}`
  );
  values.push(id);

  try {
    const result = await query(
      `UPDATE categories
       SET ${assignments.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length} AND deleted_at IS NULL
       RETURNING id, parent_category_id, name, slug, description`,
      values
    );
    if (!result.rows[0]) throw new NotFoundError('Category not found');
    await redisData.invalidateReadCache();
    return result.rows[0];
  } catch (error) {
    handleUniqueViolation(error, 'A category with this slug already exists');
  }
}

async function deactivateCategory(id) {
  const result = await query(
    `UPDATE categories
     SET is_active = FALSE, deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [id]
  );
  if (!result.rows[0]) throw new NotFoundError('Category not found');
  await redisData.invalidateReadCache();
  return { id: result.rows[0].id, deactivated: true };
}

async function createProduct(input) {
  try {
    const result = await query(
      `INSERT INTO products (category_id, name, sku, description)
       SELECT id, $2, $3, $4
       FROM categories
       WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL
       RETURNING id, category_id, name, sku, description`,
      [input.categoryId, input.name, input.sku, input.description || null]
    );
    if (!result.rows[0]) throw new ValidationError('An active category is required');
    await redisData.invalidateReadCache();
    return result.rows[0];
  } catch (error) {
    handleUniqueViolation(error, 'A product with this SKU already exists');
  }
}

async function updateProduct(id, input) {
  const fields = {
    categoryId: 'category_id',
    name: 'name',
    sku: 'sku',
    description: 'description',
  };
  const entries = Object.entries(input);
  const values = entries.map(([key]) => input[key] ?? null);
  const assignments = entries.map(
    ([key], index) => `${fields[key]} = $${index + 1}`
  );
  if (input.categoryId) {
    const category = await query(
      'SELECT 1 FROM categories WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL',
      [input.categoryId]
    );
    if (!category.rows[0]) throw new ValidationError('An active category is required');
  }
  values.push(id);

  try {
    const result = await query(
      `UPDATE products p
       SET ${assignments.join(', ')}, updated_at = NOW()
       WHERE p.id = $${values.length}
         AND p.deleted_at IS NULL
       RETURNING p.id, p.category_id, p.name, p.sku, p.description`,
      values
    );
    if (!result.rows[0]) throw new NotFoundError('Product not found or category is inactive');
    await redisData.invalidateReadCache();
    return result.rows[0];
  } catch (error) {
    handleUniqueViolation(error, 'A product with this SKU already exists');
  }
}

async function deactivateProduct(id) {
  const result = await query(
    `UPDATE products SET is_active = FALSE, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [id]
  );
  if (!result.rows[0]) throw new NotFoundError('Product not found');
  await redisData.invalidateReadCache();
  return { id: result.rows[0].id, deactivated: true };
}

function buildProductFilters(filters) {
  const values = [];
  const conditions = ['p.is_active = TRUE', 'p.deleted_at IS NULL', 'c.is_active = TRUE', 'c.deleted_at IS NULL'];
  const addValue = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (filters.keyword) {
    conditions.push(`p.search_document @@ WEBSEARCH_TO_TSQUERY('simple', ${addValue(filters.keyword)})`);
  }
  if (filters.category) {
    conditions.push(`p.category_id = ${addValue(filters.category)}`);
  }

  const offerConditions = ['sp.product_id = p.id', 'sp.is_active = TRUE'];
  if (filters.supplier) {
    offerConditions.push(`sp.supplier_user_id = ${addValue(filters.supplier)}`);
  }
  if (filters.minPrice !== undefined) {
    offerConditions.push(`sp.unit_price >= ${addValue(filters.minPrice)}`);
  }
  if (filters.maxPrice !== undefined) {
    offerConditions.push(`sp.unit_price <= ${addValue(filters.maxPrice)}`);
  }
  if (filters.currency) {
    offerConditions.push(`sp.currency = ${addValue(filters.currency)}`);
  }
  if (filters.availability === 'true') {
    offerConditions.push('i.available_quantity > 0');
  } else if (filters.availability === 'false') {
    offerConditions.push('i.available_quantity = 0');
  }

  if (filters.supplier || filters.minPrice !== undefined
    || filters.maxPrice !== undefined || filters.availability !== undefined
    || filters.currency) {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM supplier_products sp
        JOIN inventory i ON i.supplier_product_id = sp.id
        JOIN users u ON u.id = sp.supplier_user_id
          AND u.is_active = TRUE AND u.deleted_at IS NULL
        JOIN supplier_profiles eligible_supplier ON eligible_supplier.user_id = u.id
          AND eligible_supplier.verification_status = 'VERIFIED'
          AND eligible_supplier.is_suspended = FALSE
        WHERE ${offerConditions.join(' AND ')}
      )`
    );
  }

  return { values, where: conditions.join(' AND ') };
}

async function listProducts(filters) {
  return cacheReadThrough(`catalog:products:${JSON.stringify(filters)}`, async () => {
  const { values, where } = buildProductFilters(filters);
  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE ${where}`,
    values
  );
  const total = countResult.rows[0].total;
  const offset = (filters.page - 1) * filters.limit;
  const dataValues = [...values];
  let orderBy = 'p.name ASC, p.id ASC';
  if (filters.sort === 'price_asc' || filters.sort === 'price_desc') {
    dataValues.push(filters.currency);
    orderBy = `(SELECT MIN(sort_offer.unit_price)
                FROM supplier_products sort_offer
                JOIN users sort_user ON sort_user.id = sort_offer.supplier_user_id
                  AND sort_user.is_active = TRUE AND sort_user.deleted_at IS NULL
                JOIN supplier_profiles sort_supplier ON sort_supplier.user_id = sort_user.id
                  AND sort_supplier.verification_status = 'VERIFIED'
                  AND sort_supplier.is_suspended = FALSE
                WHERE sort_offer.product_id = p.id
                  AND sort_offer.is_active = TRUE
                  AND sort_offer.currency = $${dataValues.length})${filters.sort === 'price_asc' ? ' ASC' : ' DESC'} NULLS LAST, p.name ASC`;
  }
  if (filters.sort === 'newest') orderBy = 'p.created_at DESC, p.id DESC';

  const dataResult = await query(
    `SELECT p.id, p.category_id, c.name AS category_name, c.slug AS category_slug,
            p.name, p.sku, p.description, p.created_at,
            offer_stats.price_ranges, offer_stats.supplier_count,
            offer_stats.available_quantity, offer_stats.is_available
     FROM products p
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN LATERAL (
       SELECT JSONB_OBJECT_AGG(
                currency_prices.currency,
                JSONB_BUILD_OBJECT('min', currency_prices.min_price, 'max', currency_prices.max_price)
              ) AS price_ranges,
              COALESCE(SUM(currency_prices.supplier_count), 0)::INTEGER AS supplier_count,
              COALESCE(SUM(currency_prices.available_quantity), 0)::BIGINT AS available_quantity,
              BOOL_OR(currency_prices.available_quantity > 0) AS is_available
       FROM (
         SELECT sp.currency,
                MIN(sp.unit_price)::NUMERIC(12, 2) AS min_price,
                MAX(sp.unit_price)::NUMERIC(12, 2) AS max_price,
                COUNT(DISTINCT sp.supplier_user_id)::INTEGER AS supplier_count,
                SUM(i.available_quantity)::BIGINT AS available_quantity
         FROM supplier_products sp
         JOIN inventory i ON i.supplier_product_id = sp.id
         JOIN users u ON u.id = sp.supplier_user_id
           AND u.is_active = TRUE AND u.deleted_at IS NULL
         JOIN supplier_profiles eligible_supplier ON eligible_supplier.user_id = u.id
           AND eligible_supplier.verification_status = 'VERIFIED'
           AND eligible_supplier.is_suspended = FALSE
         WHERE sp.product_id = p.id AND sp.is_active = TRUE
         GROUP BY sp.currency
       ) currency_prices
     ) offer_stats ON TRUE
     WHERE ${where}
     ORDER BY ${orderBy}
     LIMIT $${dataValues.length + 1} OFFSET $${dataValues.length + 2}`,
    [...dataValues, filters.limit, offset]
  );

  return {
    data: dataResult.rows,
    page: filters.page,
    limit: filters.limit,
    total,
    totalPages: Math.ceil(total / filters.limit),
  };
  });
}

async function getProduct(id) {
  return cacheReadThrough(`catalog:product:${id}`, async () => {
  const result = await query(
    `SELECT p.id, p.category_id, c.name AS category_name, c.slug AS category_slug,
            p.name, p.sku, p.description, p.created_at
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.id = $1 AND p.is_active = TRUE AND p.deleted_at IS NULL
       AND c.is_active = TRUE AND c.deleted_at IS NULL`,
    [id]
  );
  const product = result.rows[0];
  if (!product) throw new NotFoundError('Product not found');

  const offers = await query(
    `SELECT sp.id, sp.supplier_user_id AS supplier_id,
            b.name AS supplier_name, sp.unit_price, sp.currency, sp.lead_time_days,
            i.total_quantity, i.available_quantity, i.reserved_quantity,
            (i.available_quantity > 0) AS is_available
     FROM supplier_products sp
     JOIN supplier_profiles sup ON sup.user_id = sp.supplier_user_id
     JOIN users u ON u.id = sp.supplier_user_id
       AND u.is_active = TRUE AND u.deleted_at IS NULL
     JOIN businesses b ON b.id = sup.business_id
     JOIN inventory i ON i.supplier_product_id = sp.id
     WHERE sp.product_id = $1 AND sp.is_active = TRUE
       AND sup.verification_status = 'VERIFIED' AND sup.is_suspended = FALSE
     ORDER BY sp.unit_price ASC, b.name ASC`,
    [id]
  );
  return { ...product, supplierProducts: offers.rows };
  });
}

async function createSupplierProduct(supplierUserId, input) {
  try {
    const offer = await withTransaction(async (client) => {
      const product = await client.query(
        'SELECT id FROM products WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL',
        [input.productId]
      );
      if (!product.rows[0]) throw new ValidationError('An active product is required');

      const supplierProduct = await client.query(
        `INSERT INTO supplier_products
           (supplier_user_id, product_id, unit_price, currency, lead_time_days)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, supplier_user_id, product_id, unit_price, currency, lead_time_days, is_active`,
        [supplierUserId, input.productId, input.unitPrice, input.currency, input.leadTimeDays ?? null]
      );
      const offer = supplierProduct.rows[0];
      await client.query(
        `INSERT INTO inventory
           (supplier_product_id, total_quantity, available_quantity, reserved_quantity, reorder_level)
         VALUES ($1, $2, $2, 0, $3)`,
        [offer.id, input.totalQuantity, input.reorderLevel]
      );
      return {
        ...offer,
        total_quantity: input.totalQuantity,
        available_quantity: input.totalQuantity,
        reserved_quantity: 0,
        reorder_level: input.reorderLevel,
      };
    });
    await redisData.invalidateReadCache();
    return offer;
  } catch (error) {
    handleUniqueViolation(error, 'This supplier already lists the product');
  }
}

async function listSupplierProducts(supplierUserId) {
  const result = await query(
    `SELECT sp.id, sp.product_id, p.name AS product_name, p.sku,
            sp.unit_price, sp.currency, sp.lead_time_days, sp.is_active,
            i.total_quantity, i.available_quantity, i.reserved_quantity,
            i.reorder_level, (i.available_quantity <= i.reorder_level) AS is_low_stock
     FROM supplier_products sp
     JOIN products p ON p.id = sp.product_id
     JOIN inventory i ON i.supplier_product_id = sp.id
     WHERE sp.supplier_user_id = $1
     ORDER BY p.name`,
    [supplierUserId]
  );
  return result.rows;
}

async function updateSupplierProduct(supplierUserId, id, input) {
  const fields = {
    unitPrice: 'unit_price',
    currency: 'currency',
    leadTimeDays: 'lead_time_days',
    isActive: 'is_active',
  };
  const entries = Object.entries(input);
  const values = entries.map(([key]) => input[key] ?? null);
  const assignments = entries.map(
    ([key], index) => `${fields[key]} = $${index + 1}`
  );
  values.push(id, supplierUserId);

  const result = await query(
    `UPDATE supplier_products
     SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length - 1} AND supplier_user_id = $${values.length}
     RETURNING id, product_id, unit_price, currency, lead_time_days, is_active`,
    values
  );
  if (!result.rows[0]) throw new NotFoundError('Supplier product not found');
  await redisData.invalidateReadCache();
  return result.rows[0];
}

async function listInventory(supplierUserId, lowStockOnly = false) {
  const lowStockCondition = lowStockOnly
    ? 'AND i.available_quantity <= i.reorder_level'
    : '';
  const result = await query(
    `SELECT i.id, i.supplier_product_id, sp.product_id, p.name AS product_name,
            p.sku, i.total_quantity, i.available_quantity, i.reserved_quantity,
            i.reorder_level, i.version, i.last_updated_at,
            (i.available_quantity <= i.reorder_level) AS is_low_stock
     FROM inventory i
     JOIN supplier_products sp ON sp.id = i.supplier_product_id
     JOIN products p ON p.id = sp.product_id
     WHERE sp.supplier_user_id = $1
       ${lowStockCondition}
     ORDER BY (i.available_quantity <= i.reorder_level) DESC, p.name`,
    [supplierUserId]
  );
  return result.rows;
}

async function updateInventory(supplierUserId, supplierProductId, input) {
  const updatedInventory = await withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT i.id, i.total_quantity, i.available_quantity, i.reserved_quantity, i.reorder_level
       FROM inventory i
       JOIN supplier_products sp ON sp.id = i.supplier_product_id
       WHERE sp.id = $1 AND sp.supplier_user_id = $2
       FOR UPDATE OF i`,
      [supplierProductId, supplierUserId]
    );
    const inventory = locked.rows[0];
    if (!inventory) throw new NotFoundError('Inventory record not found');

    const totalQuantity = input.totalQuantity ?? inventory.total_quantity;
    const reorderLevel = input.reorderLevel ?? inventory.reorder_level;
    if (totalQuantity < inventory.reserved_quantity) {
      throw new ConflictError(
        'Total quantity cannot be lower than the quantity already reserved',
        'INVENTORY_BELOW_RESERVED'
      );
    }
    const availableQuantity = totalQuantity - inventory.reserved_quantity;
    const updated = await client.query(
      `UPDATE inventory
       SET total_quantity = $1, available_quantity = $2, reorder_level = $3,
           version = version + 1, last_updated_at = NOW()
       WHERE id = $4
       RETURNING id, supplier_product_id, total_quantity, available_quantity,
                 reserved_quantity, reorder_level, version, last_updated_at,
                 (available_quantity <= reorder_level) AS is_low_stock`,
      [totalQuantity, availableQuantity, reorderLevel, inventory.id]
    );
    return updated.rows[0];
  });
  await redisData.invalidateReadCache();
  return updatedInventory;
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deactivateCategory,
  createProduct,
  updateProduct,
  deactivateProduct,
  listProducts,
  getProduct,
  createSupplierProduct,
  listSupplierProducts,
  updateSupplierProduct,
  listInventory,
  updateInventory,
};
