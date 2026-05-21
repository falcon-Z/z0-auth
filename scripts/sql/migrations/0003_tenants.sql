-- Tenants (organizations) and memberships; default tenant at bootstrap.

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX tenants_slug_unique ON tenants (slug);
CREATE UNIQUE INDEX tenants_one_default ON tenants (is_default) WHERE is_default = true;

CREATE TABLE tenant_memberships (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('tenant_admin', 'tenant_manager', 'tenant_member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX tenant_memberships_tenant_id_idx ON tenant_memberships (tenant_id);

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS default_tenant_id UUID REFERENCES tenants (id);

INSERT INTO schema_migrations (version)
VALUES ('0003_tenants')
ON CONFLICT (version) DO NOTHING;
