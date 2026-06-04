-- M04: per-application OAuth scope registry.

CREATE TABLE app_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_scopes_name_format CHECK (name ~ '^[a-z][a-z0-9._:/-]{0,63}$')
);

CREATE UNIQUE INDEX app_scopes_app_id_name_unique ON app_scopes (app_id, name);
CREATE INDEX app_scopes_app_id_idx ON app_scopes (app_id);

INSERT INTO schema_migrations (version)
VALUES ('0014_app_scopes')
ON CONFLICT (version) DO NOTHING;
