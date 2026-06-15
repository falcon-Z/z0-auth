-- P2: Sign-in settings, app branding, and magic-link tokens.

CREATE TABLE instance_auth_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sign_in_methods TEXT[] NOT NULL DEFAULT ARRAY['password']::TEXT[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO instance_auth_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE app_auth_settings (
  app_id UUID PRIMARY KEY REFERENCES apps (id) ON DELETE CASCADE,
  sign_in_methods TEXT[] NOT NULL DEFAULT ARRAY['password']::TEXT[],
  branding_name TEXT,
  branding_logo_url TEXT,
  branding_primary_color TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE magic_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm TEXT NOT NULL CHECK (realm IN ('console', 'app')),
  app_id UUID REFERENCES apps (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (realm = 'console' OR app_id IS NOT NULL)
);

CREATE INDEX magic_link_tokens_email_realm_idx ON magic_link_tokens (realm, lower(email));

INSERT INTO platform_resources (key, parent_key, label, sort_order) VALUES
  ('settings.sign-in', NULL, 'Sign-in settings', 61)
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_scopes (key, resource_key, action, label, description) VALUES
  ('settings.sign-in:read', 'settings.sign-in', 'read', 'View sign-in settings', 'View instance sign-in methods'),
  ('settings.sign-in:update', 'settings.sign-in', 'update', 'Update sign-in settings', 'Change instance sign-in methods')
ON CONFLICT (key) DO NOTHING;

INSERT INTO instance_role_scopes (role_id, scope_key)
SELECT r.id, s.key
FROM instance_roles r
CROSS JOIN platform_scopes s
WHERE r.key IN ('owner', 'admin')
  AND s.key IN ('settings.sign-in:read', 'settings.sign-in:update')
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('0019_p2_auth_and_email')
ON CONFLICT (version) DO NOTHING;
