ALTER TABLE oauth_authorization_codes
  ADD COLUMN IF NOT EXISTS oidc_nonce TEXT;

INSERT INTO schema_migrations (version)
VALUES ('0033_oidc_nonce')
ON CONFLICT (version) DO NOTHING;
