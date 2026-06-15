-- Enable magic-link sign-in when SMTP is already verified.

ALTER TABLE smtp_settings
  ADD COLUMN IF NOT EXISTS first_verified_at TIMESTAMPTZ;

UPDATE smtp_settings
SET first_verified_at = verified_at
WHERE verified_at IS NOT NULL
  AND first_verified_at IS NULL;

UPDATE instance_auth_settings
SET
  sign_in_methods = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(instance_auth_settings.sign_in_methods || ARRAY['magic_link']::TEXT[])
    )
  ),
  updated_at = NOW()
WHERE id = 1
  AND NOT ('magic_link' = ANY (sign_in_methods))
  AND EXISTS (
    SELECT 1
    FROM smtp_settings
    WHERE id = 1
      AND enabled = true
      AND verified_at IS NOT NULL
      AND host <> ''
      AND from_address <> ''
      AND password_ciphertext IS NOT NULL
  );

INSERT INTO schema_migrations (version)
VALUES ('0021_magic_link_sign_in_backfill')
ON CONFLICT (version) DO NOTHING;
