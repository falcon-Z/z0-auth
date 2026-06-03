-- M03: instance-scoped applications and client credentials.

CREATE TABLE apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX apps_slug_unique ON apps (slug);

CREATE TABLE app_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  client_secret_hash TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Default',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX app_credentials_client_id_unique ON app_credentials (client_id);
CREATE INDEX app_credentials_app_id_idx ON app_credentials (app_id);

INSERT INTO schema_migrations (version)
VALUES ('0012_apps_and_credentials')
ON CONFLICT (version) DO NOTHING;
