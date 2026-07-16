-- WebAuthn passkeys and single-use ceremonies for both identity realms.

CREATE TABLE passkey_credential_registry (
  credential_id TEXT PRIMARY KEY,
  realm TEXT NOT NULL CHECK (realm IN ('console', 'app')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ
);

CREATE TABLE user_passkey_handles (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  user_handle TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE app_user_passkey_handles (
  app_user_id UUID PRIMARY KEY REFERENCES app_users (id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  user_handle TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (app_user_id, app_id) REFERENCES app_users (id, app_id) ON DELETE CASCADE
);

CREATE TABLE user_passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE REFERENCES passkey_credential_registry (credential_id),
  public_key TEXT NOT NULL,
  algorithm INTEGER NOT NULL CHECK (algorithm IN (-7, -257)),
  signature_counter BIGINT NOT NULL DEFAULT 0 CHECK (signature_counter >= 0),
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  transports TEXT[] NOT NULL DEFAULT '{}',
  aaguid TEXT,
  backup_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  backup_state BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ
);

CREATE INDEX user_passkeys_owner_idx
  ON user_passkeys (user_id, created_at DESC) WHERE removed_at IS NULL;

CREATE TABLE app_user_passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE REFERENCES passkey_credential_registry (credential_id),
  public_key TEXT NOT NULL,
  algorithm INTEGER NOT NULL CHECK (algorithm IN (-7, -257)),
  signature_counter BIGINT NOT NULL DEFAULT 0 CHECK (signature_counter >= 0),
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  transports TEXT[] NOT NULL DEFAULT '{}',
  aaguid TEXT,
  backup_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  backup_state BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  FOREIGN KEY (app_user_id, app_id) REFERENCES app_users (id, app_id) ON DELETE CASCADE
);

CREATE INDEX app_user_passkeys_owner_idx
  ON app_user_passkeys (app_user_id, app_id, created_at DESC) WHERE removed_at IS NULL;

CREATE TABLE user_passkey_ceremonies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  challenge_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'authentication', 'step_up')),
  expected_origin TEXT NOT NULL,
  expected_rp_id TEXT NOT NULL,
  return_path TEXT,
  ip_hash TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL,
  failed_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX user_passkey_ceremonies_active_idx
  ON user_passkey_ceremonies (token_hash, expires_at) WHERE consumed_at IS NULL;

CREATE TABLE app_user_passkey_ceremonies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID REFERENCES app_users (id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  challenge_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'authentication', 'step_up')),
  expected_origin TEXT NOT NULL,
  expected_rp_id TEXT NOT NULL,
  return_path TEXT,
  ip_hash TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL,
  failed_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (app_user_id, app_id) REFERENCES app_users (id, app_id) ON DELETE CASCADE
);

CREATE INDEX app_user_passkey_ceremonies_active_idx
  ON app_user_passkey_ceremonies (token_hash, expires_at) WHERE consumed_at IS NULL;

CREATE FUNCTION tombstone_deleted_passkey()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE passkey_credential_registry
  SET active = FALSE, removed_at = COALESCE(removed_at, NOW())
  WHERE credential_id = OLD.credential_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER user_passkeys_tombstone_before_delete
BEFORE DELETE ON user_passkeys
FOR EACH ROW EXECUTE FUNCTION tombstone_deleted_passkey();

CREATE TRIGGER app_user_passkeys_tombstone_before_delete
BEFORE DELETE ON app_user_passkeys
FOR EACH ROW EXECUTE FUNCTION tombstone_deleted_passkey();

INSERT INTO schema_migrations (version)
VALUES ('0039_passkeys')
ON CONFLICT (version) DO NOTHING;
