CREATE TABLE IF NOT EXISTS rate_limit_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key VARCHAR(255) NOT NULL,
  route_class VARCHAR(32) NOT NULL,
  window_start TIMESTAMP NOT NULL,
  window_seconds INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (bucket_key, route_class, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup ON rate_limit_counters(bucket_key, route_class, window_start);
