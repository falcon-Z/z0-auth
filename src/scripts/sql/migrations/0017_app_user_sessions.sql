-- M06: app-user browser sessions (z0_app_session cookie).

CREATE TABLE app_user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  ip_hash TEXT,
  user_agent_hash TEXT,
  client_label TEXT NOT NULL DEFAULT 'Unknown device',
  ip_display TEXT
);

CREATE UNIQUE INDEX app_user_sessions_token_hash_unique ON app_user_sessions (token_hash);
CREATE INDEX app_user_sessions_app_user_id_idx
  ON app_user_sessions (app_user_id)
  WHERE revoked_at IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('0017_app_user_sessions')
ON CONFLICT (version) DO NOTHING;
