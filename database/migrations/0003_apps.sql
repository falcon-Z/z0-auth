CREATE TABLE IF NOT EXISTS apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  client_type VARCHAR(32) NOT NULL DEFAULT 'confidential',
  grant_types TEXT[] NOT NULL DEFAULT ARRAY['authorization_code', 'refresh_token'],
  redirect_uris TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS app_config (
  app_id UUID PRIMARY KEY REFERENCES apps(id),
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_apps_tenant_id ON apps(tenant_id) WHERE deleted_at IS NULL;
