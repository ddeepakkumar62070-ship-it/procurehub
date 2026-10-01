ALTER TABLE supplier_profiles
  ADD COLUMN rating_average NUMERIC(3, 2)
    CHECK (rating_average IS NULL OR rating_average BETWEEN 1 AND 5),
  ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0);

ALTER TABLE purchase_requests
  DROP CONSTRAINT purchase_requests_status_check,
  ADD CONSTRAINT purchase_requests_status_check
    CHECK (status IN ('OPEN', 'QUOTATION_RECEIVED', 'QUOTATION_ACCEPTED', 'CANCELLED'));

CREATE SEQUENCE quotation_number_seq START WITH 1;

CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number TEXT NOT NULL UNIQUE,
  purchase_request_id UUID NOT NULL
    REFERENCES purchase_requests(id) ON DELETE RESTRICT,
  supplier_user_id UUID NOT NULL
    REFERENCES supplier_profiles(user_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'SUBMITTED'
    CHECK (status IN ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'EXPIRED')),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  delivery_time_days INTEGER NOT NULL CHECK (delivery_time_days >= 0),
  valid_until TIMESTAMPTZ NOT NULL,
  subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
  notes TEXT,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (purchase_request_id, supplier_user_id),
  CHECK ((status = 'ACCEPTED') = (accepted_at IS NOT NULL)),
  CHECK ((status = 'REJECTED') = (rejected_at IS NOT NULL)),
  CHECK ((status = 'EXPIRED') = (expired_at IS NOT NULL))
);

CREATE INDEX quotations_request_status_idx
  ON quotations (purchase_request_id, status, created_at);
CREATE INDEX quotations_supplier_status_idx
  ON quotations (supplier_user_id, status, created_at DESC);
CREATE INDEX quotations_expiry_idx
  ON quotations (valid_until)
  WHERE status = 'SUBMITTED';

CREATE TABLE quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  purchase_request_item_id UUID NOT NULL
    REFERENCES purchase_request_items(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  product_sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (quotation_id, purchase_request_item_id)
);

CREATE INDEX quotation_items_quotation_idx ON quotation_items (quotation_id);
