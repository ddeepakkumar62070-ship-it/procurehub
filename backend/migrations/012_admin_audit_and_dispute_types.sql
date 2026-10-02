ALTER TABLE supplier_profiles
  ADD COLUMN is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN suspension_reason TEXT,
  ADD COLUMN suspended_at TIMESTAMPTZ;

ALTER TABLE order_disputes
  DROP CONSTRAINT order_disputes_category_check;

UPDATE order_disputes
SET category = CASE category
  WHEN 'DELIVERY' THEN 'ORDER_NOT_RECEIVED'
  WHEN 'QUALITY' THEN 'DAMAGED_PRODUCT'
  WHEN 'QUANTITY' THEN 'WRONG_QUANTITY'
  WHEN 'PAYMENT' THEN 'PAYMENT_ISSUE'
  ELSE 'OTHER'
END;

ALTER TABLE order_disputes
  RENAME COLUMN category TO type;

ALTER TABLE order_disputes
  ADD CONSTRAINT order_disputes_type_check
  CHECK (type IN (
    'ORDER_NOT_RECEIVED',
    'DAMAGED_PRODUCT',
    'WRONG_QUANTITY',
    'WRONG_PRODUCT',
    'PAYMENT_ISSUE',
    'OTHER'
  ));

CREATE TABLE admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  before_data JSONB,
  after_data JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (before_data IS NULL OR JSONB_TYPEOF(before_data) = 'object'),
  CHECK (after_data IS NULL OR JSONB_TYPEOF(after_data) = 'object')
);

CREATE INDEX admin_audit_logs_created_idx
  ON admin_audit_logs (created_at DESC, id DESC);
CREATE INDEX admin_audit_logs_actor_created_idx
  ON admin_audit_logs (actor_user_id, created_at DESC);
CREATE INDEX admin_audit_logs_entity_created_idx
  ON admin_audit_logs (entity_type, entity_id, created_at DESC);
