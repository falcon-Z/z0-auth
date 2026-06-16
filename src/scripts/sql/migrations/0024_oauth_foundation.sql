-- P4M1: OAuth authorization code + opaque access token foundation.

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT NOT NULL,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  app_user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  app_credential_id UUID NOT NULL REFERENCES app_credentials (id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  code_challenge TEXT,
  code_challenge_method TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE oauth_authorization_codes
  ADD COLUMN IF NOT EXISTS code_hash TEXT,
  ADD COLUMN IF NOT EXISTS app_id UUID,
  ADD COLUMN IF NOT EXISTS app_user_id UUID,
  ADD COLUMN IF NOT EXISTS app_credential_id UUID,
  ADD COLUMN IF NOT EXISTS redirect_uri TEXT,
  ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS code_challenge TEXT,
  ADD COLUMN IF NOT EXISTS code_challenge_method TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'oauth_authorization_codes'
      AND column_name = 'oauth_client_id'
  ) THEN
    EXECUTE 'ALTER TABLE oauth_authorization_codes ALTER COLUMN oauth_client_id DROP NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'oauth_authorization_codes'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE 'ALTER TABLE oauth_authorization_codes ALTER COLUMN user_id DROP NOT NULL';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS oauth_authorization_codes_code_hash_unique
  ON oauth_authorization_codes (code_hash);
CREATE INDEX IF NOT EXISTS oauth_authorization_codes_credential_expires_idx
  ON oauth_authorization_codes (app_credential_id, expires_at);
CREATE INDEX IF NOT EXISTS oauth_authorization_codes_user_created_idx
  ON oauth_authorization_codes (app_user_id, created_at);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  app_user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  app_credential_id UUID NOT NULL REFERENCES app_credentials (id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

ALTER TABLE oauth_access_tokens
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS app_id UUID,
  ADD COLUMN IF NOT EXISTS app_user_id UUID,
  ADD COLUMN IF NOT EXISTS app_credential_id UUID,
  ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS oauth_access_tokens_token_hash_unique
  ON oauth_access_tokens (token_hash);
CREATE INDEX IF NOT EXISTS oauth_access_tokens_user_active_idx
  ON oauth_access_tokens (app_user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS oauth_access_tokens_credential_active_idx
  ON oauth_access_tokens (app_credential_id, revoked_at);

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  app_user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  app_credential_id UUID NOT NULL REFERENCES app_credentials (id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT '',
  family_id UUID NOT NULL DEFAULT gen_random_uuid(),
  replaced_by_token_id UUID REFERENCES oauth_refresh_tokens (id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE oauth_refresh_tokens
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS app_id UUID,
  ADD COLUMN IF NOT EXISTS app_user_id UUID,
  ADD COLUMN IF NOT EXISTS app_credential_id UUID,
  ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS family_id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS replaced_by_token_id UUID,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS oauth_refresh_tokens_token_hash_unique
  ON oauth_refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_family_idx
  ON oauth_refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_user_active_idx
  ON oauth_refresh_tokens (app_user_id, revoked_at, expires_at);

INSERT INTO schema_migrations (version)
VALUES ('0024_oauth_foundation')
ON CONFLICT (version) DO NOTHING;
