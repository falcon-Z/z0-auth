-- Remove abandoned tenant-era OAuth artifacts and enforce app identity realms.

DROP TABLE IF EXISTS oauth_tokens CASCADE;

ALTER TABLE oauth_authorization_codes
  DROP COLUMN IF EXISTS oauth_client_id,
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS scopes;

DROP TABLE IF EXISTS oauth_clients CASCADE;

DROP INDEX IF EXISTS audit_events_tenant_created_idx;
ALTER TABLE audit_events DROP COLUMN IF EXISTS tenant_id;

DELETE FROM oauth_authorization_codes
WHERE code_hash IS NULL
   OR app_id IS NULL
   OR app_user_id IS NULL
   OR app_credential_id IS NULL
   OR redirect_uri IS NULL
   OR expires_at IS NULL
   OR scope IS NULL
   OR created_at IS NULL;

ALTER TABLE oauth_authorization_codes
  ALTER COLUMN code_hash SET NOT NULL,
  ALTER COLUMN app_id SET NOT NULL,
  ALTER COLUMN app_user_id SET NOT NULL,
  ALTER COLUMN app_credential_id SET NOT NULL,
  ALTER COLUMN redirect_uri SET NOT NULL,
  ALTER COLUMN scope SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE app_users ADD CONSTRAINT app_users_id_app_unique UNIQUE (id, app_id);
ALTER TABLE app_credentials ADD CONSTRAINT app_credentials_id_app_unique UNIQUE (id, app_id);

ALTER TABLE app_user_sessions
  ADD CONSTRAINT app_user_sessions_user_realm_fk
  FOREIGN KEY (app_user_id, app_id) REFERENCES app_users (id, app_id) ON DELETE CASCADE;
ALTER TABLE app_user_identities
  ADD CONSTRAINT app_user_identities_user_realm_fk
  FOREIGN KEY (app_user_id, app_id) REFERENCES app_users (id, app_id) ON DELETE CASCADE;
ALTER TABLE service_group_app_users
  ADD CONSTRAINT service_group_app_users_user_realm_fk
  FOREIGN KEY (app_user_id, app_id) REFERENCES app_users (id, app_id) ON DELETE CASCADE;
ALTER TABLE app_password_reset_tokens
  ADD CONSTRAINT app_password_reset_tokens_user_realm_fk
  FOREIGN KEY (app_user_id, app_id) REFERENCES app_users (id, app_id) ON DELETE CASCADE;
ALTER TABLE oauth_user_consents
  ADD CONSTRAINT oauth_user_consents_user_realm_fk
  FOREIGN KEY (app_user_id, app_id) REFERENCES app_users (id, app_id) ON DELETE CASCADE;

ALTER TABLE oauth_authorization_codes
  ADD CONSTRAINT oauth_authorization_codes_user_realm_fk
  FOREIGN KEY (app_user_id, app_id) REFERENCES app_users (id, app_id) ON DELETE CASCADE,
  ADD CONSTRAINT oauth_authorization_codes_credential_realm_fk
  FOREIGN KEY (app_credential_id, app_id) REFERENCES app_credentials (id, app_id) ON DELETE CASCADE;
ALTER TABLE oauth_access_tokens
  ADD CONSTRAINT oauth_access_tokens_user_realm_fk
  FOREIGN KEY (app_user_id, app_id) REFERENCES app_users (id, app_id) ON DELETE CASCADE,
  ADD CONSTRAINT oauth_access_tokens_credential_realm_fk
  FOREIGN KEY (app_credential_id, app_id) REFERENCES app_credentials (id, app_id) ON DELETE CASCADE;
ALTER TABLE oauth_refresh_tokens
  ADD CONSTRAINT oauth_refresh_tokens_user_realm_fk
  FOREIGN KEY (app_user_id, app_id) REFERENCES app_users (id, app_id) ON DELETE CASCADE,
  ADD CONSTRAINT oauth_refresh_tokens_credential_realm_fk
  FOREIGN KEY (app_credential_id, app_id) REFERENCES app_credentials (id, app_id) ON DELETE CASCADE;

INSERT INTO schema_migrations (version)
VALUES ('0035_schema_cleanup_and_realm_constraints')
ON CONFLICT (version) DO NOTHING;
