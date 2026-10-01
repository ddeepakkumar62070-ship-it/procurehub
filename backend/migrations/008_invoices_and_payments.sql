CREATE SEQUENCE invoice_number_seq START WITH 1;

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  order_id UUID NOT NULL UNIQUE REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  buyer_id UUID NOT NULL REFERENCES buyer_profiles(user_id) ON DELETE RESTRICT,
  supplier_id UUID NOT NULL REFERENCES supplier_profiles(user_id) ON DELETE RESTRICT,
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
  tax NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  discount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  shipping NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (shipping >= 0),
  total NUMERIC(14, 2) NOT NULL CHECK (total >= 0),
  amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNPAID'
    CHECK (status IN (
      'UNPAID', 'PAYMENT_INITIATED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'REFUNDED'
    )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (total = subtotal + tax + shipping - discount),
  CHECK (discount <= subtotal + tax + shipping),
  CHECK (amount_paid <= total),
  CHECK (due_date >= issue_date),
  CHECK (status <> 'PAID' OR amount_paid = total),
  CHECK (status <> 'PARTIALLY_PAID' OR (amount_paid > 0 AND amount_paid < total)),
  CHECK (status <> 'UNPAID' OR amount_paid = 0),
  CHECK (status <> 'OVERDUE' OR amount_paid < total)
);

CREATE INDEX invoices_buyer_status_due_idx
  ON invoices (buyer_id, status, due_date);
CREATE INDEX invoices_supplier_status_issue_idx
  ON invoices (supplier_id, status, issue_date DESC);

CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  purchase_order_item_id UUID NOT NULL
    REFERENCES purchase_order_items(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  product_sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (invoice_id, purchase_order_item_id)
);

CREATE INDEX invoice_items_invoice_idx ON invoice_items (invoice_id);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider IN ('SIMULATED', 'RAZORPAY', 'STRIPE')),
  provider_reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('INITIATED', 'SUCCEEDED', 'FAILED', 'REFUNDED')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  initiated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider_metadata JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (JSONB_TYPEOF(provider_metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX payments_invoice_created_idx ON payments (invoice_id, created_at DESC);
