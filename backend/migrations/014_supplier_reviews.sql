CREATE TABLE supplier_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL UNIQUE
    REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (review_text IS NULL OR LENGTH(TRIM(review_text)) > 0)
);

CREATE INDEX supplier_reviews_order_idx ON supplier_reviews (purchase_order_id);
