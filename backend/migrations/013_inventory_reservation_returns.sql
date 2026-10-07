-- Some databases applied an earlier version of migration 006 before return
-- reservations were added. Repair those schemas without rewriting history.
ALTER TABLE inventory_reservations
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;

ALTER TABLE inventory_reservations
  DROP CONSTRAINT IF EXISTS inventory_reservations_status_check;

ALTER TABLE inventory_reservations
  ADD CONSTRAINT inventory_reservations_status_check
    CHECK (status IN ('ACTIVE', 'CONFIRMED', 'RELEASED', 'EXPIRED', 'CONSUMED', 'RETURNED'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'inventory_reservations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%returned_at%'
  ) THEN
    ALTER TABLE inventory_reservations
      ADD CONSTRAINT inventory_reservations_returned_at_check
      CHECK ((status = 'RETURNED') = (returned_at IS NOT NULL));
  END IF;
END $$;
