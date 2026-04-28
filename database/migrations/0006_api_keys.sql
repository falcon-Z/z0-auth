CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  app_id UUID NOT NULL REFERENCES apps(id),
  key_id VARCHAR(64) NOT NULL,
  key_prefix VARCHAR(32) NOT NULL,
  label VARCHAR(255),
  secret_hash VARCHAR NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  UNIQUE (app_id, key_id)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_app ON api_keys(tenant_id, app_id) WHERE deleted_at IS NULL;
