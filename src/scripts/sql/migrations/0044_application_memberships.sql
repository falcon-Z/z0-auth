-- app_account_bindings is the durable application-subject mapping. Its ID is
-- the existing public sub, distinct from the internal Account ID. Metadata is
-- owned by that subject, including when membership is absent.
CREATE TABLE application_memberships (
  subject_id UUID PRIMARY KEY REFERENCES app_account_bindings (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((status = 'active' AND disabled_at IS NULL) OR (status = 'disabled' AND disabled_at IS NOT NULL))
);
-- Legacy lifecycle fields describe the Account; do not copy them into membership.
INSERT INTO application_memberships (subject_id, created_at, updated_at)
SELECT id, created_at, created_at FROM app_account_bindings;

CREATE FUNCTION protect_membership_subject() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.subject_id IS DISTINCT FROM OLD.subject_id THEN
    RAISE EXCEPTION 'Membership subject is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER membership_subject_before_update BEFORE UPDATE OF subject_id ON application_memberships
FOR EACH ROW EXECUTE FUNCTION protect_membership_subject();

-- Preserve the adapter's existing column order and make every legacy authority
-- reader fail closed on missing/disabled membership. Scalar membership lookups
-- retain support for FOR UPDATE of the Account and subject (no nullable join).
CREATE OR REPLACE VIEW app_users AS
SELECT b.id, b.app_id, c.email, c.name, c.password_hash,
       CASE WHEN EXISTS (SELECT 1 FROM application_memberships m WHERE m.subject_id = b.id AND m.status = 'active')
            THEN c.status ELSE 'disabled' END AS status,
       c.email_verified_at,
       CASE WHEN EXISTS (SELECT 1 FROM application_memberships m WHERE m.subject_id = b.id AND m.status = 'active')
            THEN c.disabled_at ELSE COALESCE(c.disabled_at,
              (SELECT disabled_at FROM application_memberships m WHERE m.subject_id = b.id), b.created_at) END AS disabled_at,
       c.disabled_by_user_id, c.locked_until, c.failed_sign_in_count,
       c.failed_sign_in_window_started_at, c.deleted_at, c.deleted_by_user_id,
       c.updated_at, b.metadata, b.created_at, b.account_id, b.account_domain_id,
       c.status AS account_status, c.disabled_at AS account_disabled_at,
       COALESCE((SELECT status FROM application_memberships m WHERE m.subject_id = b.id), 'removed') AS membership_status,
       (SELECT created_at FROM application_memberships m WHERE m.subject_id = b.id) AS membership_created_at
FROM accounts c
JOIN app_account_bindings b ON c.id = b.account_id AND c.account_domain_id = b.account_domain_id;

CREATE OR REPLACE FUNCTION write_legacy_app_user() RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
    INSERT INTO application_memberships (subject_id) VALUES (NEW.id);
    SELECT * INTO NEW FROM app_users WHERE id = NEW.id;
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
    -- Legacy DELETE remains an explicit Account purge. Membership removal
    -- deletes only application_memberships, preserving this subject mapping.
    DELETE FROM accounts WHERE id = OLD.account_id;
    RETURN OLD;
  END IF;
END;
$$;

-- Serialize membership changes and new app authority through the Account and
-- subject, then re-read membership after acquiring the locks. Existing subject
-- FKs keep credentials/recovery/links alive across membership removal.
CREATE FUNCTION require_active_application_membership() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.app_user_id IS NULL THEN RETURN NEW; END IF;
  PERFORM c.id FROM accounts c JOIN app_account_bindings b ON b.account_id = c.id
    WHERE b.id = NEW.app_user_id FOR UPDATE OF c;
  PERFORM id FROM app_account_bindings WHERE id = NEW.app_user_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM application_memberships WHERE subject_id = NEW.app_user_id AND status = 'active') THEN
    RAISE EXCEPTION 'Active application membership required' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM accounts c JOIN app_account_bindings b ON b.account_id = c.id
    WHERE b.id = NEW.app_user_id AND c.status = 'active'
      AND c.disabled_at IS NULL AND c.deleted_at IS NULL
      AND (c.locked_until IS NULL OR c.locked_until <= NOW())
  ) THEN
    RAISE EXCEPTION 'Account is unavailable for application authority' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'app_user_sessions', 'app_user_mfa_challenges', 'app_user_mfa_remembered_browsers',
    'oauth_authorization_codes', 'oauth_access_tokens', 'oauth_refresh_tokens', 'oauth_consent_challenges'
  ] LOOP
    EXECUTE format('CREATE TRIGGER active_application_membership BEFORE INSERT ON %I
      FOR EACH ROW EXECUTE FUNCTION require_active_application_membership()', table_name);
  END LOOP;
END;
$$;
INSERT INTO schema_migrations (version) VALUES ('0044_application_memberships') ON CONFLICT (version) DO NOTHING;
