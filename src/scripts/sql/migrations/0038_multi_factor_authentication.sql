-- TOTP MFA, recovery codes, pre-authentication challenges, remembered browsers,
-- and per-session authentication assurance for both identity realms.

CREATE TABLE user_totp_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  secret_ciphertext TEXT NOT NULL,
  last_accepted_step BIGINT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE app_user_totp_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID NOT NULL UNIQUE REFERENCES app_users (id) ON DELETE CASCADE,
  secret_ciphertext TEXT NOT NULL,
  last_accepted_step BIGINT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  display_suffix TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  UNIQUE (user_id, code_hash)
);

CREATE INDEX user_mfa_recovery_codes_active_idx
  ON user_mfa_recovery_codes (user_id) WHERE used_at IS NULL;

CREATE TABLE app_user_mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  display_suffix TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  UNIQUE (app_user_id, code_hash)
);

CREATE INDEX app_user_mfa_recovery_codes_active_idx
  ON app_user_mfa_recovery_codes (app_user_id) WHERE used_at IS NULL;

CREATE TABLE user_mfa_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  primary_method TEXT NOT NULL,
  return_path TEXT,
  ip_hash TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL,
  failed_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX user_mfa_challenges_active_idx
  ON user_mfa_challenges (token_hash, expires_at) WHERE consumed_at IS NULL;

CREATE TABLE app_user_mfa_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  primary_method TEXT NOT NULL,
  return_path TEXT,
  ip_hash TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL,
  failed_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (app_user_id, app_id) REFERENCES app_users (id, app_id) ON DELETE CASCADE
);

CREATE INDEX app_user_mfa_challenges_active_idx
  ON app_user_mfa_challenges (token_hash, expires_at) WHERE consumed_at IS NULL;

CREATE TABLE user_mfa_remembered_browsers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  previous_token_hash TEXT,
  client_label TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX user_mfa_remembered_browsers_active_idx
  ON user_mfa_remembered_browsers (user_id, created_at DESC) WHERE revoked_at IS NULL;

CREATE TABLE user_mfa_remembered_browser_tokens (
  browser_id UUID NOT NULL REFERENCES user_mfa_remembered_browsers (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (browser_id, token_hash)
);

CREATE TABLE app_user_mfa_remembered_browsers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  previous_token_hash TEXT,
  client_label TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (app_user_id, app_id) REFERENCES app_users (id, app_id) ON DELETE CASCADE
);

CREATE INDEX app_user_mfa_remembered_browsers_active_idx
  ON app_user_mfa_remembered_browsers (app_user_id, app_id, created_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE app_user_mfa_remembered_browser_tokens (
  browser_id UUID NOT NULL REFERENCES app_user_mfa_remembered_browsers (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (browser_id, token_hash)
);

ALTER TABLE sessions
  ADD COLUMN primary_authenticated_at TIMESTAMPTZ,
  ADD COLUMN mfa_authenticated_at TIMESTAMPTZ,
  ADD COLUMN authentication_method TEXT;

UPDATE sessions
SET primary_authenticated_at = created_at,
    authentication_method = 'legacy'
WHERE primary_authenticated_at IS NULL;

ALTER TABLE app_user_sessions
  ADD COLUMN primary_authenticated_at TIMESTAMPTZ,
  ADD COLUMN mfa_authenticated_at TIMESTAMPTZ,
  ADD COLUMN authentication_method TEXT;

UPDATE app_user_sessions
SET primary_authenticated_at = created_at,
    authentication_method = 'legacy'
WHERE primary_authenticated_at IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('0038_multi_factor_authentication')
ON CONFLICT (version) DO NOTHING;
