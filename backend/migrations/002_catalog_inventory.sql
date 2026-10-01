CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (parent_category_id IS NULL OR parent_category_id <> id)
);

CREATE INDEX categories_parent_active_idx
  ON categories (parent_category_id, name)
  WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  description TEXT,
  search_document TSVECTOR GENERATED ALWAYS AS (
    TO_TSVECTOR('simple', COALESCE(name, '') || ' ' || COALESCE(sku, '') || ' ' || COALESCE(description, ''))
  ) STORED,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX products_category_active_idx
  ON products (category_id, name)
  WHERE is_active = TRUE AND deleted_at IS NULL;
CREATE INDEX products_search_document_idx ON products USING GIN (search_document);

CREATE TABLE supplier_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_user_id UUID NOT NULL REFERENCES supplier_profiles(user_id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  lead_time_days INTEGER CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (supplier_user_id, product_id)
);

CREATE INDEX supplier_products_product_active_price_idx
  ON supplier_products (product_id, unit_price)
  WHERE is_active = TRUE;
CREATE INDEX supplier_products_supplier_active_idx
  ON supplier_products (supplier_user_id, product_id)
  WHERE is_active = TRUE;
CREATE INDEX supplier_products_supplier_price_active_idx
  ON supplier_products (supplier_user_id, unit_price, product_id)
  WHERE is_active = TRUE;

CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_product_id UUID NOT NULL UNIQUE
    REFERENCES supplier_products(id) ON DELETE RESTRICT,
  total_quantity INTEGER NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
  available_quantity INTEGER NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  reorder_level INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (reserved_quantity <= total_quantity),
  CHECK (available_quantity + reserved_quantity = total_quantity)
);

CREATE INDEX inventory_low_stock_idx
  ON inventory (available_quantity, reorder_level, supplier_product_id)
  WHERE available_quantity <= reorder_level;
