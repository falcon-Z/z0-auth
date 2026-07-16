-- Early-alpha account lifecycle for console members and app-local users.

ALTER TABLE users
  ADD COLUMN disabled_at TIMESTAMPTZ,
  ADD COLUMN disabled_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN locked_until TIMESTAMPTZ,
  ADD COLUMN failed_sign_in_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_sign_in_count >= 0),
  ADD COLUMN failed_sign_in_window_started_at TIMESTAMPTZ,
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN deleted_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE app_users
  ADD COLUMN disabled_at TIMESTAMPTZ,
  ADD COLUMN disabled_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN locked_until TIMESTAMPTZ,
  ADD COLUMN failed_sign_in_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_sign_in_count >= 0),
  ADD COLUMN failed_sign_in_window_started_at TIMESTAMPTZ,
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN deleted_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL;

UPDATE users SET disabled_at = COALESCE(disabled_at, updated_at, NOW()) WHERE status = 'disabled';
UPDATE app_users SET disabled_at = COALESCE(disabled_at, updated_at, NOW()) WHERE status = 'disabled';

CREATE INDEX users_lifecycle_idx ON users (deleted_at, disabled_at, locked_until);
CREATE INDEX app_users_app_lifecycle_idx ON app_users (app_id, deleted_at, disabled_at, locked_until);

CREATE TABLE app_email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID NOT NULL,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_email_verification_tokens_user_realm_fk
    FOREIGN KEY (app_user_id, app_id) REFERENCES app_users (id, app_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX app_email_verification_tokens_current_user_idx
  ON app_email_verification_tokens (app_user_id)
  WHERE used_at IS NULL;
CREATE INDEX app_email_verification_tokens_expiry_idx
  ON app_email_verification_tokens (expires_at)
  WHERE used_at IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('0037_account_lifecycle')
ON CONFLICT (version) DO NOTHING;
