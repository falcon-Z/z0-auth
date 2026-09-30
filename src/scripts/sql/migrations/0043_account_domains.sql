-- Canonical identity boundary. Never merge legacy users by matching identifiers.
CREATE TABLE account_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'independent' CHECK (kind IN ('independent', 'shared')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE apps ADD COLUMN account_domain_id UUID REFERENCES account_domains (id);
-- One private domain per application, including legacy service-group members.
INSERT INTO account_domains (id) SELECT id FROM apps;
UPDATE apps SET account_domain_id = id;
ALTER TABLE apps ALTER COLUMN account_domain_id SET NOT NULL;
ALTER TABLE apps ADD CONSTRAINT apps_id_domain_unique UNIQUE (id, account_domain_id);

CREATE FUNCTION assign_application_account_domain() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE domain_kind TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.account_domain_id IS DISTINCT FROM OLD.account_domain_id THEN
    IF EXISTS (SELECT 1 FROM accounts WHERE account_domain_id = OLD.account_domain_id) THEN
      RAISE EXCEPTION 'Account-domain placement is immutable once accounts exist' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.account_domain_id IS NULL THEN
    INSERT INTO account_domains DEFAULT VALUES RETURNING id INTO NEW.account_domain_id;
  END IF;
  SELECT kind INTO domain_kind FROM account_domains WHERE id = NEW.account_domain_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown account domain' USING ERRCODE = '23503';
  END IF;
  IF domain_kind = 'independent' AND EXISTS (
    SELECT 1 FROM apps WHERE account_domain_id = NEW.account_domain_id AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Independent account domains serve one application' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER apps_account_domain_before_write
  BEFORE INSERT OR UPDATE OF account_domain_id ON apps
  FOR EACH ROW EXECUTE FUNCTION assign_application_account_domain();

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_domain_id UUID NOT NULL REFERENCES account_domains (id),
  email TEXT NOT NULL CHECK (email = lower(email)),
  username TEXT CHECK (username IS NULL OR (username = btrim(username) AND username <> '')),
  name TEXT NOT NULL,
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  email_verified_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  disabled_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  locked_until TIMESTAMPTZ,
  failed_sign_in_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_sign_in_count >= 0),
  failed_sign_in_window_started_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deleted_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT accounts_id_domain_unique UNIQUE (id, account_domain_id)
);
CREATE UNIQUE INDEX accounts_domain_email_unique ON accounts (account_domain_id, lower(email));
CREATE UNIQUE INDEX accounts_domain_username_unique ON accounts (account_domain_id, lower(username))
  WHERE username IS NOT NULL;
CREATE INDEX accounts_domain_lifecycle_idx ON accounts (account_domain_id, deleted_at, disabled_at, locked_until);

CREATE FUNCTION protect_account_domain_identity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.account_domain_id IS DISTINCT FROM OLD.account_domain_id THEN
    RAISE EXCEPTION 'Account identity and domain are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER accounts_identity_before_update
  BEFORE UPDATE OF id, account_domain_id ON accounts
  FOR EACH ROW EXECUTE FUNCTION protect_account_domain_identity();

-- Keep legacy application-facing IDs and their FK targets. Internal account IDs
-- are new random values and never inferred from operator identities.
ALTER TABLE app_users RENAME TO app_account_bindings;
ALTER TABLE app_account_bindings ADD COLUMN account_id UUID DEFAULT gen_random_uuid();
ALTER TABLE app_account_bindings ADD COLUMN account_domain_id UUID;
UPDATE app_account_bindings b SET account_domain_id = a.account_domain_id FROM apps a WHERE a.id = b.app_id;
INSERT INTO accounts (id, account_domain_id, email, name, password_hash, status, email_verified_at, disabled_at, disabled_by_user_id, locked_until, failed_sign_in_count, failed_sign_in_window_started_at, deleted_at, deleted_by_user_id, updated_at, created_at)
SELECT account_id, account_domain_id, email, name, password_hash, status, email_verified_at, disabled_at, disabled_by_user_id, locked_until, failed_sign_in_count, failed_sign_in_window_started_at, deleted_at, deleted_by_user_id, updated_at, created_at FROM app_account_bindings;
ALTER TABLE app_account_bindings ALTER COLUMN account_id DROP DEFAULT;
ALTER TABLE app_account_bindings ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE app_account_bindings ALTER COLUMN account_domain_id SET NOT NULL;
ALTER TABLE app_account_bindings
  ADD CONSTRAINT app_account_bindings_account_domain_fk
    FOREIGN KEY (account_id, account_domain_id) REFERENCES accounts (id, account_domain_id) ON DELETE CASCADE,
  ADD CONSTRAINT app_account_bindings_app_domain_fk
    FOREIGN KEY (app_id, account_domain_id) REFERENCES apps (id, account_domain_id) ON DELETE CASCADE,
  ADD CONSTRAINT app_account_bindings_app_account_unique UNIQUE (app_id, account_id);
ALTER TABLE app_account_bindings
  DROP COLUMN email,
  DROP COLUMN name,
  DROP COLUMN password_hash,
  DROP COLUMN status,
  DROP COLUMN email_verified_at,
  DROP COLUMN disabled_at,
  DROP COLUMN disabled_by_user_id,
  DROP COLUMN locked_until,
  DROP COLUMN failed_sign_in_count,
  DROP COLUMN failed_sign_in_window_started_at,
  DROP COLUMN deleted_at,
  DROP COLUMN deleted_by_user_id,
  DROP COLUMN updated_at;

CREATE FUNCTION protect_application_account_binding() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.app_id IS DISTINCT FROM OLD.app_id
    OR NEW.account_id IS DISTINCT FROM OLD.account_id
    OR NEW.account_domain_id IS DISTINCT FROM OLD.account_domain_id THEN
    RAISE EXCEPTION 'Account and application identity bindings are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER app_account_bindings_identity_before_update
  BEFORE UPDATE OF id, app_id, account_id, account_domain_id ON app_account_bindings
  FOR EACH ROW EXECUTE FUNCTION protect_application_account_binding();

-- Temporary adapter for existing hosted-auth/admin/protocol SQL. Account fields
-- have a single source of truth; only metadata and application IDs remain local.
CREATE VIEW app_users AS
SELECT b.id, b.app_id, c.email, c.name, c.password_hash, c.status, c.email_verified_at, c.disabled_at, c.disabled_by_user_id, c.locked_until, c.failed_sign_in_count, c.failed_sign_in_window_started_at, c.deleted_at, c.deleted_by_user_id, c.updated_at, b.metadata, b.created_at,
       b.account_id, b.account_domain_id
FROM accounts c
JOIN app_account_bindings b ON c.id = b.account_id AND c.account_domain_id = b.account_domain_id;

CREATE FUNCTION write_legacy_app_user() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE domain_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT account_domain_id INTO domain_id FROM apps WHERE id = NEW.app_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unknown application' USING ERRCODE = '23503';
    END IF;
    IF NEW.account_domain_id IS NOT NULL AND NEW.account_domain_id <> domain_id THEN
      RAISE EXCEPTION 'Account domain does not match application' USING ERRCODE = '23503';
    END IF;
    -- Attaching an existing account requires an explicit repository operation.
    IF NEW.account_id IS NOT NULL THEN
      RAISE EXCEPTION 'Legacy registration cannot attach an existing account' USING ERRCODE = '23514';
    END IF;
    NEW.id := COALESCE(NEW.id, gen_random_uuid());
    NEW.account_id := gen_random_uuid();
    NEW.account_domain_id := domain_id;
    NEW.status := COALESCE(NEW.status, 'active');
    NEW.failed_sign_in_count := COALESCE(NEW.failed_sign_in_count, 0);
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.updated_at := COALESCE(NEW.updated_at, NEW.created_at);
    INSERT INTO accounts (id, account_domain_id, email, name, password_hash, status, email_verified_at, disabled_at, disabled_by_user_id, locked_until, failed_sign_in_count, failed_sign_in_window_started_at, deleted_at, deleted_by_user_id, updated_at, created_at)
    VALUES (NEW.account_id, domain_id, NEW.email, NEW.name, NEW.password_hash, NEW.status, NEW.email_verified_at, NEW.disabled_at, NEW.disabled_by_user_id, NEW.locked_until, NEW.failed_sign_in_count, NEW.failed_sign_in_window_started_at, NEW.deleted_at, NEW.deleted_by_user_id, NEW.updated_at, NEW.created_at);
    INSERT INTO app_account_bindings (id, app_id, account_id, account_domain_id, metadata, created_at)
    VALUES (NEW.id, NEW.app_id, NEW.account_id, domain_id, NEW.metadata, NEW.created_at);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.app_id IS DISTINCT FROM OLD.app_id
      OR NEW.account_id IS DISTINCT FROM OLD.account_id
      OR NEW.account_domain_id IS DISTINCT FROM OLD.account_domain_id THEN
      RAISE EXCEPTION 'Account and application identity bindings are immutable' USING ERRCODE = '23514';
    END IF;
    -- Preserve independently changed fields when concurrent adapter updates wait.
    UPDATE accounts SET
      email = CASE WHEN NEW.email IS DISTINCT FROM OLD.email THEN NEW.email ELSE email END,
      name = CASE WHEN NEW.name IS DISTINCT FROM OLD.name THEN NEW.name ELSE name END,
      password_hash = CASE WHEN NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN NEW.password_hash ELSE password_hash END,
      status = CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN NEW.status ELSE status END,
      email_verified_at = CASE WHEN NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at THEN NEW.email_verified_at ELSE email_verified_at END,
      disabled_at = CASE WHEN NEW.disabled_at IS DISTINCT FROM OLD.disabled_at THEN NEW.disabled_at ELSE disabled_at END,
      disabled_by_user_id = CASE WHEN NEW.disabled_by_user_id IS DISTINCT FROM OLD.disabled_by_user_id THEN NEW.disabled_by_user_id ELSE disabled_by_user_id END,
      locked_until = CASE WHEN NEW.locked_until IS DISTINCT FROM OLD.locked_until THEN NEW.locked_until ELSE locked_until END,
      failed_sign_in_count = CASE WHEN NEW.failed_sign_in_count IS DISTINCT FROM OLD.failed_sign_in_count THEN NEW.failed_sign_in_count ELSE failed_sign_in_count END,
      failed_sign_in_window_started_at = CASE WHEN NEW.failed_sign_in_window_started_at IS DISTINCT FROM OLD.failed_sign_in_window_started_at THEN NEW.failed_sign_in_window_started_at ELSE failed_sign_in_window_started_at END,
      deleted_at = CASE WHEN NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN NEW.deleted_at ELSE deleted_at END,
      deleted_by_user_id = CASE WHEN NEW.deleted_by_user_id IS DISTINCT FROM OLD.deleted_by_user_id THEN NEW.deleted_by_user_id ELSE deleted_by_user_id END,
      updated_at = CASE WHEN NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN NEW.updated_at ELSE updated_at END
    WHERE id = OLD.account_id;
    UPDATE app_account_bindings SET
      metadata = CASE WHEN NEW.metadata IS DISTINCT FROM OLD.metadata THEN NEW.metadata ELSE metadata END
    WHERE id = OLD.id;
    SELECT * INTO NEW FROM app_users WHERE id = OLD.id;
    RETURN NEW;
  ELSE
    -- Until membership lifecycle is introduced, legacy purge means account purge.
    DELETE FROM accounts WHERE id = OLD.account_id;
    RETURN OLD;
  END IF;
END;
$$;
CREATE TRIGGER app_users_write
  INSTEAD OF INSERT OR UPDATE OR DELETE ON app_users
  FOR EACH ROW EXECUTE FUNCTION write_legacy_app_user();

-- Canonical account/domain ownership on existing authenticators, sessions,
-- recovery credentials, external links, and authorization state. Legacy FKs
-- continue to enforce the application context in addition to these boundaries.
CREATE FUNCTION bind_account_security_state() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE binding app_account_bindings%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.app_user_id IS DISTINCT FROM OLD.app_user_id
    OR NEW.account_id IS DISTINCT FROM OLD.account_id
    OR NEW.account_domain_id IS DISTINCT FROM OLD.account_domain_id) THEN
    RAISE EXCEPTION 'Security-state account ownership is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.app_user_id IS NULL THEN
    IF NEW.account_id IS NOT NULL OR NEW.account_domain_id IS NOT NULL THEN
      RAISE EXCEPTION 'Anonymous state cannot name an account' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO binding FROM app_account_bindings WHERE id = NEW.app_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown application account' USING ERRCODE = '23503';
  END IF;
  IF (NEW.account_id IS NOT NULL AND NEW.account_id <> binding.account_id)
    OR (NEW.account_domain_id IS NOT NULL AND NEW.account_domain_id <> binding.account_domain_id) THEN
    RAISE EXCEPTION 'Security state belongs to a different account domain' USING ERRCODE = '23503';
  END IF;
  NEW.account_id := binding.account_id;
  NEW.account_domain_id := binding.account_domain_id;
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'app_user_sessions', 'app_password_reset_tokens', 'app_email_verification_tokens',
    'app_user_totp_factors', 'app_user_mfa_recovery_codes', 'app_user_mfa_challenges',
    'app_user_mfa_remembered_browsers', 'app_user_passkey_handles', 'app_user_passkeys',
    'app_user_passkey_ceremonies', 'app_user_identities',
    'oauth_authorization_codes', 'oauth_access_tokens', 'oauth_refresh_tokens', 'oauth_consent_challenges'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN account_id UUID, ADD COLUMN account_domain_id UUID', table_name);
    EXECUTE format(
      'UPDATE %I s SET account_id = b.account_id, account_domain_id = b.account_domain_id
       FROM app_account_bindings b WHERE s.app_user_id = b.id', table_name);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (account_id, account_domain_id)
       REFERENCES accounts (id, account_domain_id) ON DELETE CASCADE,
       ADD CONSTRAINT %I CHECK (
         (app_user_id IS NULL AND account_id IS NULL AND account_domain_id IS NULL)
         OR (app_user_id IS NOT NULL AND account_id IS NOT NULL AND account_domain_id IS NOT NULL)
       )', table_name, table_name || '_account_domain_fk', table_name || '_account_owner_check');
    EXECUTE format(
      'CREATE TRIGGER account_security_owner BEFORE INSERT OR UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION bind_account_security_state()', table_name);
    EXECUTE format('CREATE INDEX %I ON %I (account_id)', table_name || '_account_idx', table_name);
  END LOOP;
END;
$$;

ALTER TABLE app_user_identities ADD COLUMN issuer TEXT;
UPDATE app_user_identities i SET issuer = COALESCE(NULLIF(p.issuer, ''), 'urn:z0-auth:legacy-provider:' || p.id)
FROM identity_providers p WHERE p.id = i.identity_provider_id;
ALTER TABLE app_user_identities ALTER COLUMN issuer SET NOT NULL;
CREATE FUNCTION bind_external_identity_issuer() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.issuer IS DISTINCT FROM OLD.issuer
    OR NEW.provider_subject IS DISTINCT FROM OLD.provider_subject
    OR NEW.account_id IS DISTINCT FROM OLD.account_id) THEN
    RAISE EXCEPTION 'External identity authority is immutable; unlink and relink explicitly' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(NULLIF(issuer, ''), 'urn:z0-auth:legacy-provider:' || id) INTO NEW.issuer
    FROM identity_providers WHERE id = NEW.identity_provider_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER external_identity_issuer
  BEFORE INSERT OR UPDATE ON app_user_identities
  FOR EACH ROW EXECUTE FUNCTION bind_external_identity_issuer();
CREATE UNIQUE INDEX app_user_identities_domain_issuer_subject_unique
  ON app_user_identities (account_domain_id, issuer, provider_subject);

INSERT INTO schema_migrations (version) VALUES ('0043_account_domains') ON CONFLICT (version) DO NOTHING;
