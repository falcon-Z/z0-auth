-- P1-M1: credentials split, scoped RBAC, preferences, audit, OAuth stubs.

-- Password credentials (one row per user for local login in v1)
CREATE TABLE password_credentials (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO password_credentials (user_id, password_hash)
SELECT id, password_hash
FROM users;

ALTER TABLE users DROP COLUMN password_hash;

-- RBAC catalog
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('platform', 'tenant')),
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (key, scope)
);

CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX user_roles_platform_unique
  ON user_roles (user_id, role_id)
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX user_roles_tenant_unique
  ON user_roles (user_id, role_id, tenant_id)
  WHERE tenant_id IS NOT NULL;

INSERT INTO permissions (key, description) VALUES
  ('platform:manage', 'Platform administration'),
  ('tenants:create', 'Create organizations'),
  ('tenants:read', 'View organization details'),
  ('users:read', 'View users in organization'),
  ('users:invite', 'Invite users to organization'),
  ('sessions:revoke', 'Revoke sessions')
ON CONFLICT (key) DO NOTHING;

INSERT INTO roles (key, scope, description) VALUES
  ('platform_admin', 'platform', 'Full platform access'),
  ('platform_manager', 'platform', 'Platform operations'),
  ('tenant_admin', 'tenant', 'Organization administrator'),
  ('tenant_manager', 'tenant', 'Organization manager'),
  ('tenant_member', 'tenant', 'Organization member')
ON CONFLICT (key, scope) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'platform_admin' AND r.scope = 'platform'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key IN ('tenants:read', 'users:read', 'users:invite', 'sessions:revoke')
WHERE r.key = 'tenant_admin' AND r.scope = 'tenant'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key IN ('tenants:read', 'users:read', 'sessions:revoke')
WHERE r.key = 'tenant_manager' AND r.scope = 'tenant'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key = 'tenants:read'
WHERE r.key = 'tenant_member' AND r.scope = 'tenant'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id, tenant_id)
SELECT pm.user_id, r.id, NULL
FROM platform_memberships pm
JOIN roles r ON r.key = pm.role AND r.scope = 'platform'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id, tenant_id)
SELECT tm.user_id, r.id, tm.tenant_id
FROM tenant_memberships tm
JOIN roles r ON r.key = tm.role AND r.scope = 'tenant'
ON CONFLICT DO NOTHING;

-- Active organization (tenant) preference for console context
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  active_tenant_id UUID REFERENCES tenants (id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO user_preferences (user_id, active_tenant_id)
SELECT DISTINCT ON (tm.user_id)
  tm.user_id,
  tm.tenant_id
FROM tenant_memberships tm
JOIN tenants t ON t.id = tm.tenant_id
ORDER BY tm.user_id, t.is_default DESC, t.created_at ASC
ON CONFLICT (user_id) DO NOTHING;

-- Append-only audit log
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants (id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_events_tenant_created_idx ON audit_events (tenant_id, created_at DESC);
CREATE INDEX audit_events_actor_created_idx ON audit_events (actor_user_id, created_at DESC);

-- OAuth (planned endpoints — schema only)
CREATE TABLE oauth_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  client_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  client_type TEXT NOT NULL CHECK (client_type IN ('confidential', 'public')),
  client_secret_hash TEXT,
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  allowed_scopes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disabled_at TIMESTAMPTZ
);

CREATE INDEX oauth_clients_tenant_id_idx ON oauth_clients (tenant_id);

CREATE TABLE oauth_authorization_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oauth_client_id UUID NOT NULL REFERENCES oauth_clients (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  redirect_uri TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  code_challenge TEXT,
  code_challenge_method TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oauth_client_id UUID NOT NULL REFERENCES oauth_clients (id) ON DELETE CASCADE,
  user_id UUID REFERENCES users (id) ON DELETE CASCADE,
  access_token_hash TEXT NOT NULL,
  refresh_token_hash TEXT UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version)
VALUES ('0005_p1_data_model')
ON CONFLICT (version) DO NOTHING;
