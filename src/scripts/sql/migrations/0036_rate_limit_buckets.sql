CREATE TABLE rate_limit_buckets (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK (count >= 0),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX rate_limit_buckets_expires_idx ON rate_limit_buckets (expires_at);

INSERT INTO schema_migrations (version)
VALUES ('0036_rate_limit_buckets')
ON CONFLICT (version) DO NOTHING;
