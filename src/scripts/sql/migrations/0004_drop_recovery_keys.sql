-- Remove recovery keys (password reset via email comes in a later phase).

DROP TABLE IF EXISTS user_recovery_keys;

INSERT INTO schema_migrations (version)
VALUES ('0004_drop_recovery_keys')
ON CONFLICT (version) DO NOTHING;
