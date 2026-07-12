-- Baseline schema for local development. Extended by future migrations.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  checksum TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version)
VALUES ('0001_baseline')
ON CONFLICT (version) DO NOTHING;
