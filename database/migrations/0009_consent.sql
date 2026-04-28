CREATE TABLE IF NOT EXISTS consent_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  app_id UUID NOT NULL REFERENCES apps(id),
  identity_id UUID NOT NULL REFERENCES identities(id),
  scopes TEXT[] NOT NULL,
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  UNIQUE (tenant_id, app_id, identity_id)
);

CREATE INDEX IF NOT EXISTS idx_consent_active ON consent_grants(tenant_id, app_id, identity_id) WHERE revoked_at IS NULL AND deleted_at IS NULL;
