-- P4M5: Machine-to-machine access tokens without an app user subject.

ALTER TABLE oauth_access_tokens
  ALTER COLUMN app_user_id DROP NOT NULL;

INSERT INTO schema_migrations (version)
VALUES ('0027_oauth_machine_tokens')
ON CONFLICT (version) DO NOTHING;
