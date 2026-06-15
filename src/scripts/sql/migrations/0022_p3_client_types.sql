-- P3M1: public (SPA) vs confidential (server) client types; public credentials have no secret.

ALTER TABLE apps
  ADD COLUMN client_type TEXT NOT NULL DEFAULT 'confidential'
    CHECK (client_type IN ('public', 'confidential'));

ALTER TABLE app_credentials
  ALTER COLUMN client_secret_hash DROP NOT NULL;

INSERT INTO schema_migrations (version)
VALUES ('0022_p3_client_types')
ON CONFLICT (version) DO NOTHING;
