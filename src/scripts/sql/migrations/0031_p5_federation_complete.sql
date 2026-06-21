-- P5 completion: provider metadata (Apple team/key) and federation:token app scope

ALTER TABLE identity_providers
  ADD COLUMN IF NOT EXISTS provider_metadata JSONB;

INSERT INTO app_scopes (app_id, name, description)
SELECT a.id, 'federation:token', 'Retrieve upstream provider tokens for signed-in users'
FROM apps a
WHERE NOT EXISTS (
  SELECT 1
  FROM app_scopes s
  WHERE s.app_id = a.id
    AND s.name = 'federation:token'
);

INSERT INTO schema_migrations (version)
VALUES ('0031_p5_federation_complete')
ON CONFLICT (version) DO NOTHING;
