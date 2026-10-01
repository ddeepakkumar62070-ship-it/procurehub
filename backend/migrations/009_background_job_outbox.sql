CREATE TABLE background_job_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name TEXT NOT NULL,
  job_name TEXT NOT NULL,
  job_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PUBLISHED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  UNIQUE (queue_name, job_id)
);

CREATE INDEX idx_background_job_outbox_pending
  ON background_job_outbox (created_at, id)
  WHERE status = 'PENDING';
