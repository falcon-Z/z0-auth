CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  app_id UUID NOT NULL REFERENCES apps(id),
  identity_id UUID NOT NULL REFERENCES identities(id),
  user_agent TEXT,
  ip_address VARCHAR(64),
  last_seen_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refresh_token_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  app_id UUID NOT NULL REFERENCES apps(id),
  identity_id UUID NOT NULL REFERENCES identities(id),
  revoked_at TIMESTAMP,
  revoke_reason VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refresh_token_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES refresh_token_families(id),
  token_hash VARCHAR NOT NULL,
  parent_token_id UUID REFERENCES refresh_token_instances(id),
  consumed_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS access_token_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  app_id UUID NOT NULL REFERENCES apps(id),
  session_id UUID NOT NULL REFERENCES sessions(id),
  token_jti VARCHAR(128) NOT NULL,
  revoked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason VARCHAR(128),
  UNIQUE (session_id, token_jti)
);

CREATE INDEX IF NOT EXISTS idx_sessions_identity_app ON sessions(identity_id, app_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_instances_family_exp ON refresh_token_instances(family_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_access_revocations_tenant_app ON access_token_revocations(tenant_id, app_id, revoked_at);
