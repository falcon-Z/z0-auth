-- Resource audiences are reserved forever, including after retirement.
CREATE TABLE oauth_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE RESTRICT,
  audience TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, app_id)
);
ALTER TABLE app_scopes ADD CONSTRAINT app_scopes_id_app_unique UNIQUE (id, app_id);
CREATE TABLE oauth_resource_scopes (
  resource_id UUID NOT NULL,
  app_id UUID NOT NULL,
  scope_id UUID NOT NULL,
  PRIMARY KEY (resource_id, scope_id),
  FOREIGN KEY (resource_id, app_id) REFERENCES oauth_resources(id, app_id),
  FOREIGN KEY (scope_id, app_id) REFERENCES app_scopes(id, app_id) ON DELETE CASCADE
);
CREATE TABLE client_resource_permissions (
  client_id UUID NOT NULL,
  resource_id UUID NOT NULL REFERENCES oauth_resources(id),
  PRIMARY KEY (client_id, resource_id),
  FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE
);
-- A client can be explicitly permitted to call resources owned by other applications.
CREATE TABLE client_resource_scopes (
  client_id UUID NOT NULL,
  resource_id UUID NOT NULL,
  scope_id UUID NOT NULL,
  PRIMARY KEY (client_id, resource_id, scope_id),
  FOREIGN KEY (client_id, resource_id) REFERENCES client_resource_permissions ON DELETE CASCADE,
  FOREIGN KEY (resource_id, scope_id) REFERENCES oauth_resource_scopes ON DELETE CASCADE
);
CREATE TABLE oauth_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  app_user_id UUID,
  resource_id UUID NOT NULL REFERENCES oauth_resources(id),
  scope TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  FOREIGN KEY (client_id, app_id) REFERENCES oauth_clients(id, app_id) ON DELETE CASCADE,
  FOREIGN KEY (app_user_id, app_id) REFERENCES app_account_bindings(id, app_id) ON DELETE CASCADE
);
ALTER TABLE oauth_authorization_codes ADD COLUMN resource_id UUID REFERENCES oauth_resources(id);
ALTER TABLE oauth_consent_challenges ADD COLUMN resource_id UUID REFERENCES oauth_resources(id);
ALTER TABLE oauth_access_tokens ADD COLUMN resource_id UUID REFERENCES oauth_resources(id), ADD COLUMN grant_id UUID REFERENCES oauth_grants(id) ON DELETE CASCADE;
ALTER TABLE oauth_refresh_tokens ADD COLUMN resource_id UUID REFERENCES oauth_resources(id), ADD COLUMN grant_id UUID REFERENCES oauth_grants(id) ON DELETE CASCADE;
CREATE INDEX oauth_grants_authority_idx ON oauth_grants(client_id, resource_id) WHERE revoked_at IS NULL;
-- Historical application-audience authority cannot be reinterpreted as Resource authority.
UPDATE oauth_authorization_codes SET used_at = COALESCE(used_at, NOW());
UPDATE oauth_consent_challenges SET consumed_at = COALESCE(consumed_at, NOW()), completion_outcome = COALESCE(completion_outcome, 'expired');
UPDATE oauth_access_tokens SET revoked_at = COALESCE(revoked_at, NOW());
UPDATE oauth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()), retry_key_hash = NULL, retry_response_ciphertext = NULL, retry_expires_at = NULL;

CREATE FUNCTION protect_resource_identity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Resource audiences must remain reserved' USING ERRCODE = '23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.app_id IS DISTINCT FROM OLD.app_id OR NEW.audience IS DISTINCT FROM OLD.audience
    OR (OLD.status = 'retired' AND NEW.status <> 'retired') THEN
    RAISE EXCEPTION 'Resource identity and retirement are permanent' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER oauth_resources_identity BEFORE UPDATE OR DELETE ON oauth_resources FOR EACH ROW EXECUTE FUNCTION protect_resource_identity();
CREATE FUNCTION protect_grant_authority() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.app_id IS DISTINCT FROM OLD.app_id OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.app_user_id IS DISTINCT FROM OLD.app_user_id OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
    OR NOT (string_to_array(NEW.scope, ' ') <@ string_to_array(OLD.scope, ' '))
    OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'Grant authority may only contract' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER oauth_grants_authority BEFORE UPDATE ON oauth_grants FOR EACH ROW EXECUTE FUNCTION protect_grant_authority();

INSERT INTO platform_resources (key, parent_key, label, sort_order) VALUES ('apps.resources', 'apps', 'API resources', 52);
INSERT INTO platform_scopes (key, resource_key, action, label, description) VALUES
 ('apps.resources:read', 'apps.resources', 'read', 'View resources', 'View registered API audiences and scope vocabulary'),
 ('apps.resources:manage', 'apps.resources', 'manage', 'Manage resources', 'Register and retire API resources and configure scopes');
-- Preserve the scope-management operator ceiling for the new resource registry.
INSERT INTO instance_role_scopes (role_id, scope_key) SELECT role_id, 'apps.resources:read' FROM instance_role_scopes WHERE scope_key = 'apps.scopes:read';
INSERT INTO instance_role_scopes (role_id, scope_key) SELECT role_id, 'apps.resources:manage' FROM instance_role_scopes WHERE scope_key = 'apps.scopes:manage';
INSERT INTO schema_migrations (version) VALUES ('0047_oauth_resources') ON CONFLICT DO NOTHING;
