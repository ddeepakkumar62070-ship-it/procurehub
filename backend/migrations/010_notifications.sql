CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'NEW_PURCHASE_REQUEST',
    'NEW_QUOTATION',
    'QUOTATION_ACCEPTED',
    'QUOTATION_REJECTED',
    'ORDER_CONFIRMED',
    'ORDER_SHIPPED',
    'ORDER_DELIVERED',
    'PAYMENT_RECEIVED',
    'QUOTATION_EXPIRING',
    'LOW_STOCK'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  dedupe_key TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, dedupe_key)
);

CREATE INDEX idx_notifications_user_created
  ON notifications (user_id, created_at DESC, id DESC);

CREATE INDEX idx_notifications_unread
  ON notifications (user_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;
