-- A Client's protocol identity is independent of its verification credentials.
CREATE TABLE client_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  secret_digest TEXT NOT NULL,
  digest_algorithm TEXT NOT NULL CHECK (digest_algorithm IN ('sha256', 'argon2id')),
  label TEXT CHECK (char_length(label) BETWEEN 1 AND 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revocation_reason TEXT CHECK (revocation_reason IN ('ordinary', 'compromised')),
  CHECK ((revoked_at IS NULL) = (revocation_reason IS NULL))
);
CREATE INDEX client_secrets_client ON client_secrets(client_id, created_at);
-- Retain each existing one-way verifier; plaintext cannot be recovered to rehash.
-- A historical revocation remains revoked. Disablement alone is not secret revocation.
INSERT INTO client_secrets(client_id, secret_digest, digest_algorithm, created_at, revoked_at, revocation_reason)
SELECT id, client_secret_hash, 'argon2id', created_at, revoked_at,
  CASE WHEN revoked_at IS NOT NULL THEN 'ordinary' END
FROM oauth_clients WHERE client_type = 'confidential';
ALTER TABLE oauth_clients DROP CONSTRAINT oauth_clients_secret_class;
ALTER TABLE oauth_clients DROP COLUMN client_secret_hash;
CREATE FUNCTION protect_client_secret() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.secret_digest IS DISTINCT FROM OLD.secret_digest OR NEW.digest_algorithm IS DISTINCT FROM OLD.digest_algorithm
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (NEW.created_by IS DISTINCT FROM OLD.created_by AND NEW.created_by IS NOT NULL)
    OR (OLD.revoked_at IS NOT NULL AND (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
      OR NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason))) THEN
    RAISE EXCEPTION 'Secret identity, verifier, creation and revocation are immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM oauth_clients WHERE id = NEW.client_id AND client_type = 'confidential') THEN
    RAISE EXCEPTION 'Public clients cannot have secrets' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER client_secrets_before_write BEFORE INSERT OR UPDATE ON client_secrets
FOR EACH ROW EXECUTE FUNCTION protect_client_secret();
UPDATE platform_scopes SET label = 'Add client secrets', description = 'Add independent secrets to confidential OAuth clients' WHERE key = 'apps.clients:rotate';
UPDATE platform_scopes SET label = 'Revoke client secrets', description = 'Individually revoke confidential OAuth client secrets' WHERE key = 'apps.clients:revoke';
INSERT INTO schema_migrations(version) VALUES ('0049_client_secrets') ON CONFLICT DO NOTHING;
