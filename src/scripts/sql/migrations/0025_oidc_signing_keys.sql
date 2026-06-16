-- P4M2: OIDC signing key storage for RS256 ID tokens and JWKS.

CREATE TABLE IF NOT EXISTS oidc_signing_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'RS256',
  public_jwk JSONB NOT NULL,
  private_key_ciphertext TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  activated_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE oidc_signing_keys
  ADD COLUMN IF NOT EXISTS kid TEXT,
  ADD COLUMN IF NOT EXISTS algorithm TEXT DEFAULT 'RS256',
  ADD COLUMN IF NOT EXISTS public_jwk JSONB,
  ADD COLUMN IF NOT EXISTS private_key_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE oidc_signing_keys
SET algorithm = COALESCE(algorithm, 'RS256'),
    status = COALESCE(status, 'active'),
    updated_at = COALESCE(updated_at, NOW())
WHERE algorithm IS NULL OR status IS NULL OR updated_at IS NULL;

ALTER TABLE oidc_signing_keys
  ALTER COLUMN kid SET NOT NULL,
  ALTER COLUMN algorithm SET NOT NULL,
  ALTER COLUMN public_jwk SET NOT NULL,
  ALTER COLUMN private_key_ciphertext SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'oidc_signing_keys_status_check'
  ) THEN
    ALTER TABLE oidc_signing_keys
      ADD CONSTRAINT oidc_signing_keys_status_check
      CHECK (status IN ('active', 'retired', 'revoked'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS oidc_signing_keys_kid_unique
  ON oidc_signing_keys (kid);

CREATE UNIQUE INDEX IF NOT EXISTS oidc_signing_keys_one_active_idx
  ON oidc_signing_keys ((status))
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS oidc_signing_keys_status_activated_idx
  ON oidc_signing_keys (status, activated_at);

INSERT INTO schema_migrations (version)
VALUES ('0025_oidc_signing_keys')
ON CONFLICT (version) DO NOTHING;
