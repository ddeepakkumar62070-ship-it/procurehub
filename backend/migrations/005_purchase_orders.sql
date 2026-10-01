CREATE SEQUENCE purchase_order_number_seq START WITH 1;

CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  purchase_request_id UUID NOT NULL UNIQUE
    REFERENCES purchase_requests(id) ON DELETE RESTRICT,
  quotation_id UUID NOT NULL UNIQUE REFERENCES quotations(id) ON DELETE RESTRICT,
  buyer_user_id UUID NOT NULL REFERENCES buyer_profiles(user_id) ON DELETE RESTRICT,
  supplier_user_id UUID NOT NULL REFERENCES supplier_profiles(user_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'PO_CREATED'
    CHECK (status IN (
      'REQUESTED', 'QUOTATION_RECEIVED', 'QUOTATION_ACCEPTED', 'PO_CREATED',
      'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED',
      'INVOICE_GENERATED', 'PAYMENT_PENDING', 'PAID', 'COMPLETED',
      'CANCELLED', 'REJECTED', 'EXPIRED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'
    )),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
  delivery_time_days INTEGER NOT NULL CHECK (delivery_time_days >= 0),
  expected_delivery_date DATE NOT NULL,
  required_delivery_date DATE NOT NULL,
  delivery_location JSONB NOT NULL CHECK (JSONB_TYPEOF(delivery_location) = 'object'),
  buyer_notes TEXT,
  confirmed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  invoice_generated_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX purchase_orders_buyer_status_created_idx
  ON purchase_orders (buyer_user_id, status, created_at DESC);
CREATE INDEX purchase_orders_supplier_status_created_idx
  ON purchase_orders (supplier_user_id, status, created_at DESC);
CREATE INDEX purchase_orders_expected_delivery_idx
  ON purchase_orders (expected_delivery_date, status);

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL
    REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  quotation_item_id UUID NOT NULL REFERENCES quotation_items(id) ON DELETE RESTRICT,
  purchase_request_item_id UUID NOT NULL
    REFERENCES purchase_request_items(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  product_sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (purchase_order_id, quotation_item_id),
  UNIQUE (purchase_order_id, purchase_request_item_id)
);

CREATE INDEX purchase_order_items_order_idx
  ON purchase_order_items (purchase_order_id);
CREATE INDEX purchase_order_items_product_idx
  ON purchase_order_items (product_id, purchase_order_id);

CREATE TABLE purchase_order_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL
    REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  from_status TEXT NOT NULL
    CHECK (from_status IN (
      'REQUESTED', 'QUOTATION_RECEIVED', 'QUOTATION_ACCEPTED', 'PO_CREATED',
      'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED',
      'INVOICE_GENERATED', 'PAYMENT_PENDING', 'PAID', 'COMPLETED',
      'CANCELLED', 'REJECTED', 'EXPIRED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'
    )),
  to_status TEXT NOT NULL
    CHECK (to_status IN (
      'REQUESTED', 'QUOTATION_RECEIVED', 'QUOTATION_ACCEPTED', 'PO_CREATED',
      'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED',
      'INVOICE_GENERATED', 'PAYMENT_PENDING', 'PAID', 'COMPLETED',
      'CANCELLED', 'REJECTED', 'EXPIRED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'
    )),
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('BUYER', 'SUPPLIER', 'ADMIN')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX purchase_order_audit_order_created_idx
  ON purchase_order_audit_logs (purchase_order_id, created_at, id);
