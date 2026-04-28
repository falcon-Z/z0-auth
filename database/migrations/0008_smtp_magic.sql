CREATE TABLE IF NOT EXISTS smtp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id),
  state VARCHAR(32) NOT NULL DEFAULT 'unconfigured',
  host VARCHAR(255),
  port INTEGER,
  username VARCHAR(255),
  password_encrypted VARCHAR,
  from_email VARCHAR(254),
  last_error TEXT,
  last_verified_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (platform_id)
);

CREATE TABLE IF NOT EXISTS magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  app_id UUID NOT NULL REFERENCES apps(id),
  identity_id UUID NOT NULL REFERENCES identities(id),
  token_hash VARCHAR NOT NULL,
  purpose VARCHAR(64) NOT NULL,
  used_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_magic_links_lookup ON magic_links(identity_id, purpose, expires_at);
