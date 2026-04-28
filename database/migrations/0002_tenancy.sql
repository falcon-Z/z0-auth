CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id),
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  UNIQUE (platform_id, name)
);

CREATE TABLE IF NOT EXISTS tenant_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR NOT NULL,
  role VARCHAR(64) NOT NULL DEFAULT 'tenant_admin',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_tenants_platform_id ON tenants(platform_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_admins_tenant_id ON tenant_admins(tenant_id) WHERE deleted_at IS NULL;
