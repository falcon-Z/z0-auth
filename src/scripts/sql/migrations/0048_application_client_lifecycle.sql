ALTER TABLE apps DROP CONSTRAINT apps_status_check;
ALTER TABLE apps ADD CONSTRAINT apps_status_check CHECK (status IN ('active', 'disabled', 'pending_deletion'));
ALTER TABLE apps ADD COLUMN deletion_started_at TIMESTAMPTZ, ADD COLUMN purge_after TIMESTAMPTZ;
ALTER TABLE oauth_clients ADD COLUMN deletion_started_at TIMESTAMPTZ, ADD COLUMN purge_after TIMESTAMPTZ;
ALTER TABLE apps ADD CONSTRAINT apps_deletion_state CHECK (
  (status = 'pending_deletion') = (deletion_started_at IS NOT NULL AND purge_after IS NOT NULL)
  AND (status = 'pending_deletion' OR (deletion_started_at IS NULL AND purge_after IS NULL))
);
ALTER TABLE oauth_clients ADD CONSTRAINT oauth_clients_deletion_state CHECK (
  (status = 'pending_deletion') = (deletion_started_at IS NOT NULL AND purge_after IS NOT NULL)
  AND (status = 'pending_deletion' OR (deletion_started_at IS NULL AND purge_after IS NULL))
);
-- Minimal, non-authenticatable identifier reservations survive physical purge.
CREATE TABLE retired_oauth_client_ids (
  client_id TEXT PRIMARY KEY,
  retired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE FUNCTION reserve_purged_client_id() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(CASE WHEN TG_OP = 'DELETE' THEN OLD.client_id ELSE NEW.client_id END, 0));
  IF TG_OP = 'DELETE' THEN
    INSERT INTO retired_oauth_client_ids (client_id) VALUES (OLD.client_id) ON CONFLICT DO NOTHING;
    RETURN OLD;
  END IF;
  IF EXISTS (SELECT 1 FROM retired_oauth_client_ids WHERE client_id = NEW.client_id) THEN
    RAISE EXCEPTION 'Retired client identifiers cannot be reused' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER oauth_clients_reserve_identifier BEFORE INSERT OR DELETE ON oauth_clients
FOR EACH ROW EXECUTE FUNCTION reserve_purged_client_id();
CREATE FUNCTION protect_retired_client_id() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Retired client identifiers are permanent' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER retired_client_ids_immutable BEFORE UPDATE OR DELETE ON retired_oauth_client_ids
FOR EACH ROW EXECUTE FUNCTION protect_retired_client_id();
-- A purged Resource owner must not leave an Application registration alive.
-- Retain the already-approved permanent audience reservation, with no owner.
ALTER TABLE oauth_resources ALTER COLUMN app_id DROP NOT NULL;
ALTER TABLE oauth_resources ADD CONSTRAINT oauth_resources_retired_owner CHECK (app_id IS NOT NULL OR status = 'retired');
CREATE OR REPLACE FUNCTION protect_resource_identity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Resource audiences must remain reserved' USING ERRCODE = '23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.audience IS DISTINCT FROM OLD.audience
    OR (NEW.app_id IS DISTINCT FROM OLD.app_id AND NOT (OLD.app_id IS NOT NULL AND NEW.app_id IS NULL AND NEW.status = 'retired'))
    OR (OLD.status = 'retired' AND NEW.status <> 'retired') THEN
    RAISE EXCEPTION 'Resource identity and retirement are permanent' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
INSERT INTO platform_scopes (key, resource_key, action, label, description) VALUES
  ('apps:delete', 'apps', 'delete', 'Delete applications', 'Schedule, restore and permanently purge applications'),
  ('apps.clients:delete', 'apps.clients', 'delete', 'Delete clients', 'Schedule, restore and permanently purge OAuth clients')
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
-- Delete is a distinct privilege; it is not inferred from ordinary edit access.
-- Existing Application-deletion authority already includes every child Client.
INSERT INTO instance_role_scopes (role_id, scope_key)
SELECT role_id, 'apps.clients:delete' FROM instance_role_scopes WHERE scope_key = 'apps:delete'
ON CONFLICT DO NOTHING;
-- Platform Owners already bypass the ordinary role scope catalog.
CREATE TABLE registration_lifecycle_verifications (
  token_hash TEXT PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id UUID NOT NULL,
  client_id UUID,
  action TEXT NOT NULL CHECK (action IN ('delete', 'purge')),
  grace_days INTEGER,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() + INTERVAL '10 minutes',
  consumed_at TIMESTAMPTZ
);
CREATE INDEX apps_pending_purge ON apps(purge_after) WHERE status = 'pending_deletion';
CREATE INDEX clients_pending_purge ON oauth_clients(app_id, purge_after) WHERE status = 'pending_deletion';
CREATE INDEX registration_verifications_expiry ON registration_lifecycle_verifications(expires_at);
INSERT INTO schema_migrations (version) VALUES ('0048_application_client_lifecycle') ON CONFLICT DO NOTHING;
