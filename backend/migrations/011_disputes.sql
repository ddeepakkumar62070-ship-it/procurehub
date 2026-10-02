CREATE TABLE order_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  opened_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN (
    'DELIVERY', 'QUALITY', 'PAYMENT', 'QUANTITY', 'OTHER'
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN (
    'OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'
  )),
  resolution TEXT,
  resolved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX order_disputes_order_created_idx
  ON order_disputes (order_id, created_at DESC);
CREATE INDEX order_disputes_status_created_idx
  ON order_disputes (status, created_at DESC);
CREATE INDEX order_disputes_opened_by_idx
  ON order_disputes (opened_by, created_at DESC);

CREATE TABLE order_dispute_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES order_disputes(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX order_dispute_audit_dispute_created_idx
  ON order_dispute_audit_logs (dispute_id, created_at, id);
