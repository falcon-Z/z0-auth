-- PostgreSQL-authoritative, purpose-bound OAuth consent challenges.

CREATE TABLE oauth_consent_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose TEXT NOT NULL DEFAULT 'oauth_consent'
    CHECK (purpose = 'oauth_consent'),
  nonce_hash TEXT NOT NULL UNIQUE,
  app_user_id UUID NOT NULL,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  app_credential_id UUID NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  oauth_state TEXT,
  code_challenge TEXT,
  code_challenge_method TEXT,
  oidc_nonce TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  completion_outcome TEXT
    CHECK (completion_outcome IN ('approved', 'denied', 'expired', 'mismatched')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (app_user_id, app_id)
    REFERENCES app_users (id, app_id) ON DELETE CASCADE,
  FOREIGN KEY (app_credential_id, app_id)
    REFERENCES app_credentials (id, app_id) ON DELETE CASCADE
);

CREATE INDEX oauth_consent_challenges_active_idx
  ON oauth_consent_challenges (nonce_hash, expires_at)
  WHERE consumed_at IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('0040_oauth_consent_challenges')
ON CONFLICT (version) DO NOTHING;
