-- Backfill SMTP verified_at for instances that already had working SMTP before the verified gate.

UPDATE smtp_settings
SET verified_at = COALESCE(verified_at, updated_at)
WHERE enabled
  AND host IS NOT NULL
  AND trim(host) <> ''
  AND from_address IS NOT NULL
  AND trim(from_address) <> ''
  AND password_ciphertext IS NOT NULL;

INSERT INTO schema_migrations (version)
VALUES ('0020_smtp_verified_backfill')
ON CONFLICT (version) DO NOTHING;
