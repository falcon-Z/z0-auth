-- Preserve client identifiers and protocol FK targets; split client security
-- configuration from the application identity relationship.
ALTER TABLE app_credentials RENAME TO oauth_clients;
ALTER TABLE apps ADD COLUMN minimum_assurance TEXT NOT NULL DEFAULT 'baseline'
  CHECK (minimum_assurance IN ('baseline', 'strong'));
ALTER TABLE oauth_clients
  ADD COLUMN client_type TEXT,
  ADD COLUMN purpose TEXT NOT NULL DEFAULT 'interactive' CHECK (purpose IN ('interactive', 'workload')),
  ADD COLUMN redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN browser_origins TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN refresh_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN assurance_override TEXT CHECK (assurance_override IN ('baseline', 'strong')),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN disabled_at TIMESTAMPTZ;
UPDATE oauth_clients c SET client_type = a.client_type, redirect_uris = a.redirect_uris
FROM apps a WHERE a.id = c.app_id;
ALTER TABLE oauth_clients ALTER COLUMN client_type SET NOT NULL;
ALTER TABLE oauth_clients ADD CONSTRAINT oauth_clients_class CHECK (client_type IN ('public', 'confidential'));
ALTER TABLE oauth_clients DROP CONSTRAINT app_credentials_status_check;
UPDATE oauth_clients SET status = 'disabled', disabled_at = revoked_at WHERE status = 'revoked';
ALTER TABLE oauth_clients ADD CONSTRAINT oauth_clients_status CHECK (status IN ('active', 'disabled', 'pending_deletion', 'purged'));
UPDATE oauth_clients SET status = 'disabled', disabled_at = COALESCE(disabled_at, NOW())
WHERE status = 'active' AND cardinality(redirect_uris) = 0;
ALTER TABLE oauth_clients ADD CONSTRAINT oauth_clients_redirects CHECK (
  status <> 'active' OR purpose <> 'interactive' OR cardinality(redirect_uris) > 0
);
ALTER TABLE oauth_clients ADD CONSTRAINT oauth_clients_browser_class CHECK (
  cardinality(browser_origins) = 0 OR (purpose = 'interactive' AND client_type = 'public')
);
ALTER TABLE oauth_clients ADD CONSTRAINT oauth_clients_purpose CHECK (
  (purpose = 'interactive') OR
  (purpose = 'workload' AND client_type = 'confidential' AND cardinality(redirect_uris) = 0
    AND cardinality(browser_origins) = 0 AND NOT refresh_enabled AND assurance_override IS NULL)
);
ALTER TABLE oauth_clients ADD CONSTRAINT oauth_clients_secret_class CHECK (
  (client_type = 'public' AND client_secret_hash IS NULL) OR
  (client_type = 'confidential' AND client_secret_hash IS NOT NULL)
);
ALTER TABLE oauth_authorization_codes ADD COLUMN issued_assurance TEXT NOT NULL DEFAULT 'baseline' CHECK (issued_assurance IN ('baseline', 'strong'));
ALTER TABLE oauth_refresh_tokens ADD COLUMN issued_assurance TEXT NOT NULL DEFAULT 'baseline' CHECK (issued_assurance IN ('baseline', 'strong'));
-- Existing mixed-purpose authority cannot safely become workload authority.
-- Keep interactive clients, and retire their old machine/renewable authority.
UPDATE oauth_access_tokens SET revoked_at = NOW() WHERE app_user_id IS NULL AND revoked_at IS NULL;
UPDATE oauth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()), retry_key_hash = NULL,
  retry_response_ciphertext = NULL, retry_expires_at = NULL;
ALTER TABLE apps DROP COLUMN client_type, DROP COLUMN redirect_uris;

CREATE FUNCTION protect_oauth_client_identity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE parent_minimum TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.app_id IS DISTINCT FROM OLD.app_id
    OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.client_type IS DISTINCT FROM OLD.client_type
    OR NEW.purpose IS DISTINCT FROM OLD.purpose) THEN
    RAISE EXCEPTION 'Client identity, security class and purpose are immutable' USING ERRCODE = '23514';
  END IF;
  SELECT minimum_assurance INTO parent_minimum FROM apps WHERE id = NEW.app_id FOR UPDATE;
  IF parent_minimum = 'strong' AND NEW.assurance_override = 'baseline' THEN
    RAISE EXCEPTION 'Client cannot weaken application minimum assurance' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER oauth_clients_before_write BEFORE INSERT OR UPDATE ON oauth_clients
FOR EACH ROW EXECUTE FUNCTION protect_oauth_client_identity();
CREATE FUNCTION strengthen_application_clients() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.minimum_assurance = 'strong' THEN
    UPDATE oauth_clients SET assurance_override = NULL WHERE app_id = NEW.id AND assurance_override = 'baseline';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER apps_assurance_after_update AFTER UPDATE OF minimum_assurance ON apps
FOR EACH ROW EXECUTE FUNCTION strengthen_application_clients();
-- Preserve explicit operator grants while replacing the credential catalog.
INSERT INTO platform_resources (key, parent_key, label, sort_order) VALUES ('apps.clients', 'apps', 'OAuth clients', 51);
INSERT INTO platform_scopes (key, resource_key, action, label, description)
SELECT replace(key, 'apps.credentials:', 'apps.clients:'), 'apps.clients', action, label, description
FROM platform_scopes WHERE resource_key = 'apps.credentials';
INSERT INTO instance_role_scopes (role_id, scope_key)
SELECT role_id, replace(scope_key, 'apps.credentials:', 'apps.clients:') FROM instance_role_scopes
WHERE scope_key LIKE 'apps.credentials:%';
INSERT INTO platform_scopes (key, resource_key, action, label, description)
VALUES ('apps.clients:update', 'apps.clients', 'update', 'Manage clients', 'Edit child OAuth client configuration');
INSERT INTO instance_role_scopes (role_id, scope_key)
-- Existing application editors already controlled callbacks and lifecycle.
-- Creating client credentials alone does not grant configuration-update authority.
SELECT role_id, 'apps.clients:update' FROM instance_role_scopes WHERE scope_key = 'apps:update';
DELETE FROM platform_resources WHERE key = 'apps.credentials';
INSERT INTO schema_migrations (version) VALUES ('0046_oauth_clients') ON CONFLICT (version) DO NOTHING;
