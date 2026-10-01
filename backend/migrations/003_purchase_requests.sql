CREATE SEQUENCE purchase_request_number_seq START WITH 1;

CREATE TABLE purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number TEXT NOT NULL UNIQUE,
  buyer_user_id UUID NOT NULL REFERENCES buyer_profiles(user_id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CANCELLED')),
  required_delivery_date DATE NOT NULL,
  delivery_location JSONB NOT NULL,
  notes TEXT,
  search_document TSVECTOR GENERATED ALWAYS AS (
    TO_TSVECTOR('simple', COALESCE(title, '') || ' ' || COALESCE(notes, ''))
  ) STORED,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (JSONB_TYPEOF(delivery_location) = 'object'),
  CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL))
);

CREATE INDEX purchase_requests_buyer_status_created_idx
  ON purchase_requests (buyer_user_id, status, created_at DESC);
CREATE INDEX purchase_requests_status_delivery_date_idx
  ON purchase_requests (status, required_delivery_date, created_at DESC);
CREATE INDEX purchase_requests_search_document_idx
  ON purchase_requests USING GIN (search_document);

CREATE TABLE purchase_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id UUID NOT NULL
    REFERENCES purchase_requests(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  product_sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  search_document TSVECTOR GENERATED ALWAYS AS (
    TO_TSVECTOR('simple', COALESCE(product_name, '') || ' ' || COALESCE(product_sku, ''))
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (purchase_request_id, product_id)
);

CREATE INDEX purchase_request_items_request_idx
  ON purchase_request_items (purchase_request_id);
CREATE INDEX purchase_request_items_product_request_idx
  ON purchase_request_items (product_id, purchase_request_id);
CREATE INDEX purchase_request_items_search_document_idx
  ON purchase_request_items USING GIN (search_document);
