ALTER TABLE purchase_orders
  ADD COLUMN expired_at TIMESTAMPTZ,
  ADD COLUMN rejected_at TIMESTAMPTZ;

ALTER TABLE purchase_order_audit_logs
  ALTER COLUMN actor_user_id DROP NOT NULL,
  DROP CONSTRAINT purchase_order_audit_logs_actor_role_check,
  ADD CONSTRAINT purchase_order_audit_logs_actor_role_check
    CHECK (actor_role IN ('BUYER', 'SUPPLIER', 'ADMIN', 'SYSTEM')),
  ADD CONSTRAINT purchase_order_audit_logs_system_actor_check
    CHECK ((actor_role = 'SYSTEM') = (actor_user_id IS NULL));

CREATE TABLE inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  purchase_order_item_id UUID NOT NULL
    REFERENCES purchase_order_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'CONFIRMED', 'RELEASED', 'EXPIRED', 'CONSUMED')),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (purchase_order_item_id),
  CHECK (status <> 'CONFIRMED' OR confirmed_at IS NOT NULL),
  CHECK (status <> 'ACTIVE' OR confirmed_at IS NULL),
  CHECK ((status IN ('RELEASED', 'EXPIRED')) = (released_at IS NOT NULL)),
  CHECK ((status = 'CONSUMED') = (consumed_at IS NOT NULL))
);

CREATE INDEX inventory_reservations_expiry_idx
  ON inventory_reservations (expires_at, purchase_order_id)
  WHERE status = 'ACTIVE';
CREATE INDEX inventory_reservations_order_status_idx
  ON inventory_reservations (purchase_order_id, status);
CREATE INDEX inventory_reservations_inventory_status_idx
  ON inventory_reservations (inventory_id, status);
