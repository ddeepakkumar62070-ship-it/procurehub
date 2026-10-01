CREATE TABLE api_idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL
    CHECK (idempotency_key ~ '^[A-Za-z0-9._~-]{1,128}$'),
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  response JSONB,
  response_status SMALLINT,
  status TEXT NOT NULL DEFAULT 'PROCESSING'
    CHECK (status IN ('PROCESSING', 'COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key),
  CHECK (
    (status = 'PROCESSING' AND response IS NULL AND response_status IS NULL)
    OR (status = 'COMPLETED' AND response IS NOT NULL AND response_status IS NOT NULL)
  )
);

CREATE INDEX api_idempotency_keys_created_idx
  ON api_idempotency_keys (created_at);
