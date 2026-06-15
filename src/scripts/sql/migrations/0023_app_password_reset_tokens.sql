-- P3M5: per-app password reset tokens (scoped to app_users).

CREATE TABLE app_password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX app_password_reset_tokens_hash_unique ON app_password_reset_tokens (token_hash);
CREATE INDEX app_password_reset_tokens_app_user_idx ON app_password_reset_tokens (app_user_id);

INSERT INTO schema_migrations (version)
VALUES ('0023_app_password_reset_tokens')
ON CONFLICT (version) DO NOTHING;
