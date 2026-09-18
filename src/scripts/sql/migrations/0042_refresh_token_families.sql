-- Takeover-resistant refresh-token rotation with a narrowly bounded retry window.

ALTER TABLE oauth_refresh_tokens
  ADD COLUMN retry_key_hash TEXT,
  ADD COLUMN retry_response_ciphertext TEXT,
  ADD COLUMN retry_expires_at TIMESTAMPTZ,
  ADD COLUMN compromised_at TIMESTAMPTZ;

ALTER TABLE oauth_access_tokens
  ADD COLUMN refresh_family_id UUID;

CREATE INDEX oauth_access_tokens_refresh_family_idx
  ON oauth_access_tokens (refresh_family_id)
  WHERE refresh_family_id IS NOT NULL;

-- Tokens issued before this migration cannot be associated with a family safely.
-- Revoke them once at upgrade so every surviving bearer token has complete lineage.
UPDATE oauth_refresh_tokens
SET revoked_at = COALESCE(revoked_at, NOW());

UPDATE oauth_access_tokens
SET revoked_at = COALESCE(revoked_at, NOW())
WHERE app_user_id IS NOT NULL;

INSERT INTO schema_migrations (version)
VALUES ('0042_refresh_token_families')
ON CONFLICT (version) DO NOTHING;
