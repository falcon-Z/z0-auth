-- P4M3: Persist per-user OAuth consent for scope approval and skip policy.

CREATE TABLE IF NOT EXISTS oauth_user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT '',
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (app_user_id, app_id)
);

CREATE INDEX IF NOT EXISTS oauth_user_consents_app_idx
  ON oauth_user_consents (app_id);

INSERT INTO schema_migrations (version)
VALUES ('0026_oauth_user_consents')
ON CONFLICT (version) DO NOTHING;
