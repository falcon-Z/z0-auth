-- Replace pre-Alpha email-linking semantics without importing them as Account
-- authority. Populated applications retain their independent identities and
-- leave the old grouping automatically; empty applications can be regrouped.
-- Old sibling SSO grants did not preserve reliable primary-proof provenance.
-- Retire their application authority before removing the associations. Browser
-- brokers, unrelated grants, console authority, and workload tokens survive.
DO $$
DECLARE authority_table TEXT;
BEGIN
  FOREACH authority_table IN ARRAY ARRAY['app_user_sessions', 'oauth_access_tokens', 'oauth_refresh_tokens'] LOOP
    EXECUTE format('UPDATE %I authority SET revoked_at = NOW()
      WHERE authority.revoked_at IS NULL AND authority.app_user_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM service_group_apps ga JOIN apps a ON a.id = ga.app_id
          JOIN accounts c ON c.account_domain_id = a.account_domain_id
          WHERE ga.app_id = authority.app_id)', authority_table);
  END LOOP;
END;
$$;
UPDATE oauth_authorization_codes authority SET used_at = NOW()
WHERE authority.used_at IS NULL AND EXISTS (
  SELECT 1 FROM service_group_apps ga JOIN apps a ON a.id = ga.app_id
  JOIN accounts c ON c.account_domain_id = a.account_domain_id WHERE ga.app_id = authority.app_id
);
UPDATE app_user_mfa_challenges authority SET consumed_at = NOW()
WHERE authority.consumed_at IS NULL AND authority.primary_method = 'service_group' AND EXISTS (
  SELECT 1 FROM service_group_apps ga JOIN apps a ON a.id = ga.app_id
  JOIN accounts c ON c.account_domain_id = a.account_domain_id WHERE ga.app_id = authority.app_id
);
UPDATE oauth_consent_challenges authority SET consumed_at = NOW(), completion_outcome = 'expired'
WHERE authority.consumed_at IS NULL AND EXISTS (
  SELECT 1 FROM service_group_apps ga JOIN apps a ON a.id = ga.app_id
  JOIN accounts c ON c.account_domain_id = a.account_domain_id WHERE ga.app_id = authority.app_id
);
DELETE FROM service_group_apps ga USING apps a
WHERE a.id = ga.app_id AND EXISTS (
  SELECT 1 FROM accounts c WHERE c.account_domain_id = a.account_domain_id
);
DROP TABLE service_group_app_users;
DROP TABLE service_group_members;

-- SSO step-up derives its primary proof from this live grant, rather than
-- treating an MFA challenge as a new primary authentication.
ALTER TABLE app_user_mfa_challenges ADD COLUMN source_session_id UUID
  REFERENCES app_user_sessions (id) ON DELETE CASCADE;

-- Placement is fixed after the first identity, including after final purge.
ALTER TABLE account_domains ADD COLUMN identities_created_at TIMESTAMPTZ;
UPDATE account_domains d SET identities_created_at = c.first_created_at
FROM (SELECT account_domain_id, MIN(created_at) AS first_created_at FROM accounts GROUP BY account_domain_id) c
WHERE d.id = c.account_domain_id;
CREATE FUNCTION protect_domain_identity_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.identities_created_at IS NOT NULL AND NEW.identities_created_at IS DISTINCT FROM OLD.identities_created_at THEN
    RAISE EXCEPTION 'Account Domain identity history is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER account_domains_history_before_update BEFORE UPDATE OF identities_created_at ON account_domains
  FOR EACH ROW EXECUTE FUNCTION protect_domain_identity_history();

ALTER TABLE service_groups ADD COLUMN account_domain_id UUID REFERENCES account_domains (id);
INSERT INTO account_domains (id, kind) SELECT id, 'shared' FROM service_groups;
UPDATE service_groups SET account_domain_id = id;
ALTER TABLE service_groups ALTER COLUMN account_domain_id SET NOT NULL;
ALTER TABLE service_groups ADD CONSTRAINT service_groups_domain_unique UNIQUE (account_domain_id);
ALTER TABLE service_groups ADD CONSTRAINT service_groups_id_domain_unique UNIQUE (id, account_domain_id);
UPDATE apps a SET account_domain_id = g.account_domain_id
FROM service_group_apps ga JOIN service_groups g ON g.id = ga.group_id WHERE a.id = ga.app_id;
ALTER TABLE service_group_apps ADD COLUMN account_domain_id UUID;
UPDATE service_group_apps ga SET account_domain_id = g.account_domain_id FROM service_groups g WHERE g.id = ga.group_id;
ALTER TABLE service_group_apps ALTER COLUMN account_domain_id SET NOT NULL;
ALTER TABLE service_group_apps ADD CONSTRAINT service_group_apps_group_domain_fk
  FOREIGN KEY (group_id, account_domain_id) REFERENCES service_groups (id, account_domain_id) ON DELETE CASCADE;
ALTER TABLE service_group_apps ADD CONSTRAINT service_group_apps_app_domain_fk
  FOREIGN KEY (app_id, account_domain_id) REFERENCES apps (id, account_domain_id) ON DELETE CASCADE;

-- Domain locks serialize placement against canonical Account creation, including
-- accounts with no subject/membership. Check after locking, not before waiting.
CREATE OR REPLACE FUNCTION assign_application_account_domain() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE domain_kind TEXT;
BEGIN
  IF NEW.account_domain_id IS NULL THEN
    INSERT INTO account_domains DEFAULT VALUES RETURNING id INTO NEW.account_domain_id;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.account_domain_id IS DISTINCT FROM OLD.account_domain_id THEN
    PERFORM id FROM account_domains WHERE id IN (OLD.account_domain_id, NEW.account_domain_id) ORDER BY id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM account_domains WHERE id = OLD.account_domain_id AND identities_created_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Account-domain placement is immutable once accounts exist' USING ERRCODE = '23514';
    END IF;
  END IF;
  SELECT kind INTO domain_kind FROM account_domains WHERE id = NEW.account_domain_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown account domain' USING ERRCODE = '23503'; END IF;
  IF domain_kind = 'independent' AND EXISTS (
    SELECT 1 FROM apps WHERE account_domain_id = NEW.account_domain_id AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Independent account domains serve one application' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION lock_account_domain_for_creation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE account_domains SET identities_created_at = COALESCE(identities_created_at, NOW())
    WHERE id = NEW.account_domain_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER accounts_domain_before_insert BEFORE INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION lock_account_domain_for_creation();

CREATE FUNCTION bind_service_group_domain() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE domain_kind TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.account_domain_id IS NULL THEN
      INSERT INTO account_domains (kind) VALUES ('shared') RETURNING id INTO NEW.account_domain_id;
    END IF;
  ELSIF NEW.account_domain_id IS DISTINCT FROM OLD.account_domain_id THEN
    RAISE EXCEPTION 'SSO group domain is immutable' USING ERRCODE = '23514';
  END IF;
  SELECT kind INTO domain_kind FROM account_domains WHERE id = NEW.account_domain_id FOR UPDATE;
  IF domain_kind IS DISTINCT FROM 'shared' THEN
    RAISE EXCEPTION 'SSO groups require a shared Account Domain' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER service_groups_domain_before_write BEFORE INSERT OR UPDATE ON service_groups
  FOR EACH ROW EXECUTE FUNCTION bind_service_group_domain();

CREATE FUNCTION assign_service_group_application() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE domain_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Replace SSO group associations explicitly' USING ERRCODE = '23514';
  END IF;
  SELECT account_domain_id INTO domain_id FROM service_groups WHERE id = NEW.group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown SSO group' USING ERRCODE = '23503'; END IF;
  IF NEW.account_domain_id IS NOT NULL AND NEW.account_domain_id <> domain_id THEN
    RAISE EXCEPTION 'SSO group domain mismatch' USING ERRCODE = '23514';
  END IF;
  UPDATE apps SET account_domain_id = domain_id WHERE id = NEW.app_id;
  NEW.account_domain_id := domain_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER service_group_apps_before_write BEFORE INSERT OR UPDATE ON service_group_apps
  FOR EACH ROW EXECUTE FUNCTION assign_service_group_application();

CREATE FUNCTION detach_service_group_application() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE private_domain UUID;
BEGIN
  -- Application purge may cascade this association; no surviving app to move.
  IF EXISTS (SELECT 1 FROM apps WHERE id = OLD.app_id) THEN
    INSERT INTO account_domains DEFAULT VALUES RETURNING id INTO private_domain;
    UPDATE apps SET account_domain_id = private_domain WHERE id = OLD.app_id;
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER service_group_apps_after_delete AFTER DELETE ON service_group_apps
  FOR EACH ROW EXECUTE FUNCTION detach_service_group_application();

CREATE FUNCTION protect_populated_sso_group() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM account_domains WHERE id = OLD.account_domain_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM account_domains WHERE id = OLD.account_domain_id AND identities_created_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Populated SSO groups cannot be deleted in Alpha' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER service_groups_before_delete BEFORE DELETE ON service_groups
  FOR EACH ROW EXECUTE FUNCTION protect_populated_sso_group();
-- Preserve the current single-TOTP contract at Account ownership. Multiple
-- factors and recovery-policy completion are tracked separately in #108.
CREATE UNIQUE INDEX app_user_totp_factors_account_unique ON app_user_totp_factors (account_id);
CREATE UNIQUE INDEX app_user_passkey_handles_account_unique ON app_user_passkey_handles (account_id);

-- Authenticators and external links belong to the Account, not the application
-- that enrolled them. Keep source UUIDs as immutable historical provenance;
-- deleting that application must not delete credentials used by its siblings.
CREATE FUNCTION bind_canonical_account_credential() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE binding app_account_bindings%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.app_user_id IS DISTINCT FROM OLD.app_user_id
      OR (to_jsonb(NEW)->>'app_id') IS DISTINCT FROM (to_jsonb(OLD)->>'app_id')
      OR NEW.account_id IS DISTINCT FROM OLD.account_id
      OR NEW.account_domain_id IS DISTINCT FROM OLD.account_domain_id THEN
      RAISE EXCEPTION 'Credential Account ownership and enrollment provenance are immutable' USING ERRCODE = '23514';
    END IF;
    -- Enrollment provenance may no longer resolve after application purge.
    -- The retained canonical Account/domain FK is the ownership authority.
    RETURN NEW;
  END IF;
  SELECT * INTO binding FROM app_account_bindings WHERE id = NEW.app_user_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown credential enrollment subject' USING ERRCODE = '23503';
  END IF;
  IF (to_jsonb(NEW) ? 'app_id' AND (to_jsonb(NEW)->>'app_id')::uuid IS DISTINCT FROM binding.app_id)
    OR (NEW.account_id IS NOT NULL AND NEW.account_id <> binding.account_id)
    OR (NEW.account_domain_id IS NOT NULL AND NEW.account_domain_id <> binding.account_domain_id) THEN
    RAISE EXCEPTION 'Credential belongs to a different Account/domain' USING ERRCODE = '23503';
  END IF;
  NEW.account_id := binding.account_id;
  NEW.account_domain_id := binding.account_domain_id;
  RETURN NEW;
END;
$$;
DO $$
DECLARE table_name TEXT; source_fk RECORD;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'app_user_totp_factors', 'app_user_mfa_recovery_codes', 'app_user_passkey_handles',
    'app_user_passkeys', 'app_user_identities'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN account_id SET NOT NULL,
      ALTER COLUMN account_domain_id SET NOT NULL', table_name);
    FOR source_fk IN SELECT conname FROM pg_constraint
      WHERE conrelid = to_regclass(table_name) AND contype = 'f'
        AND confrelid IN ('apps'::regclass, 'app_account_bindings'::regclass)
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', table_name, source_fk.conname);
    END LOOP;
    EXECUTE format('DROP TRIGGER account_security_owner ON %I', table_name);
    EXECUTE format('CREATE TRIGGER account_security_owner BEFORE INSERT OR UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION bind_canonical_account_credential()', table_name);
  END LOOP;
END;
$$;

CREATE FUNCTION protect_bound_domain_kind() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind AND (
    EXISTS (SELECT 1 FROM apps WHERE account_domain_id = OLD.id)
    OR EXISTS (SELECT 1 FROM service_groups WHERE account_domain_id = OLD.id)
    OR EXISTS (SELECT 1 FROM accounts WHERE account_domain_id = OLD.id)
  ) THEN
    RAISE EXCEPTION 'Bound Account Domain kind is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER account_domains_kind_before_update BEFORE UPDATE OF kind ON account_domains
  FOR EACH ROW EXECUTE FUNCTION protect_bound_domain_kind();
INSERT INTO schema_migrations (version) VALUES ('0045_shared_sso_account_domains') ON CONFLICT (version) DO NOTHING;
