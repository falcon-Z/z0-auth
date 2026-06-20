-- P5: External OAuth providers (federation)

ALTER TABLE app_users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE identity_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('builtin', 'custom')),
  builtin_id TEXT CHECK (
    builtin_id IS NULL OR builtin_id IN ('google', 'apple', 'github', 'facebook')
  ),
  display_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  authorization_url TEXT,
  token_url TEXT,
  userinfo_url TEXT,
  issuer TEXT,
  jwks_url TEXT,
  default_scopes TEXT NOT NULL DEFAULT '',
  client_id TEXT,
  client_secret_ciphertext TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT identity_providers_key_lowercase CHECK (key = lower(key)),
  CONSTRAINT identity_providers_builtin CHECK (
    (type = 'builtin' AND builtin_id IS NOT NULL)
    OR (type = 'custom' AND builtin_id IS NULL)
  )
);

CREATE UNIQUE INDEX identity_providers_key_unique ON identity_providers (key);

CREATE TABLE app_identity_providers (
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  identity_provider_id UUID NOT NULL REFERENCES identity_providers (id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  requested_scopes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_id, identity_provider_id)
);

CREATE INDEX app_identity_providers_app_id_idx ON app_identity_providers (app_id, sort_order);

CREATE TABLE app_user_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  identity_provider_id UUID NOT NULL REFERENCES identity_providers (id) ON DELETE CASCADE,
  provider_subject TEXT NOT NULL,
  provider_email TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  profile JSONB,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX app_user_identities_provider_subject_unique
  ON app_user_identities (identity_provider_id, provider_subject);
CREATE UNIQUE INDEX app_user_identities_user_provider_unique
  ON app_user_identities (app_user_id, identity_provider_id);
CREATE INDEX app_user_identities_app_email_idx
  ON app_user_identities (app_id, lower(provider_email))
  WHERE provider_email IS NOT NULL;

CREATE TABLE app_user_provider_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_identity_id UUID NOT NULL REFERENCES app_user_identities (id) ON DELETE CASCADE,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT,
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  scope TEXT,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX app_user_provider_tokens_identity_idx
  ON app_user_provider_tokens (app_user_identity_id, revoked_at);

INSERT INTO platform_resources (key, parent_key, label, sort_order) VALUES
  ('settings.federation', NULL, 'Sign-in providers', 62),
  ('apps.federation', 'apps', 'App federation', 54)
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_scopes (key, resource_key, action, label, description) VALUES
  ('settings.federation:read', 'settings.federation', 'read', 'View sign-in providers', 'View external OAuth provider configuration'),
  ('settings.federation:update', 'settings.federation', 'update', 'Manage sign-in providers', 'Configure external OAuth providers'),
  ('apps.federation:read', 'apps.federation', 'read', 'View app federation', 'View which providers are enabled for an app'),
  ('apps.federation:manage', 'apps.federation', 'manage', 'Manage app federation', 'Enable providers and scopes for an app')
ON CONFLICT (key) DO NOTHING;

INSERT INTO instance_role_scopes (role_id, scope_key)
SELECT r.id, s.key
FROM instance_roles r
CROSS JOIN platform_scopes s
WHERE r.key IN ('owner', 'admin')
  AND s.key IN ('settings.federation:read', 'settings.federation:update')
ON CONFLICT DO NOTHING;

INSERT INTO instance_role_scopes (role_id, scope_key)
SELECT r.id, s.key
FROM instance_roles r
CROSS JOIN platform_scopes s
WHERE r.key = 'developer'
  AND s.key IN ('apps.federation:read', 'apps.federation:manage')
ON CONFLICT DO NOTHING;

INSERT INTO instance_role_scopes (role_id, scope_key)
SELECT r.id, s.key
FROM instance_roles r
CROSS JOIN platform_scopes s
WHERE r.key = 'viewer'
  AND s.key IN ('settings.federation:read', 'apps.federation:read')
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('0028_p5_federation')
ON CONFLICT (version) DO NOTHING;
