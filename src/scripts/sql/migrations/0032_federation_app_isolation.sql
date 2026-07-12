-- Federated subjects belong to an app identity realm, not to the whole instance.

DROP INDEX IF EXISTS app_user_identities_provider_subject_unique;

CREATE UNIQUE INDEX app_user_identities_app_provider_subject_unique
  ON app_user_identities (app_id, identity_provider_id, provider_subject);

INSERT INTO schema_migrations (version)
VALUES ('0032_federation_app_isolation')
ON CONFLICT (version) DO NOTHING;
