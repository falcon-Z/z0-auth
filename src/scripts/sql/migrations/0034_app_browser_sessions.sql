CREATE TABLE app_browser_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  ip_hash TEXT,
  user_agent_hash TEXT,
  client_label TEXT NOT NULL DEFAULT 'Unknown device',
  ip_display TEXT
);

-- Preserve every existing cookie as a one-grant browser session.
INSERT INTO app_browser_sessions (
  id, token_hash, expires_at, created_at, last_seen_at, revoked_at,
  ip_hash, user_agent_hash, client_label, ip_display
)
SELECT
  id, token_hash, expires_at, created_at, last_seen_at, revoked_at,
  ip_hash, user_agent_hash, client_label, ip_display
FROM app_user_sessions;

ALTER TABLE app_user_sessions
  ADD COLUMN browser_session_id UUID REFERENCES app_browser_sessions (id) ON DELETE CASCADE;

UPDATE app_user_sessions SET browser_session_id = id WHERE browser_session_id IS NULL;

ALTER TABLE app_user_sessions
  ALTER COLUMN browser_session_id SET NOT NULL,
  ALTER COLUMN token_hash DROP NOT NULL;

CREATE UNIQUE INDEX app_user_sessions_browser_app_active_unique
  ON app_user_sessions (browser_session_id, app_id)
  WHERE revoked_at IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('0034_app_browser_sessions')
ON CONFLICT (version) DO NOTHING;
