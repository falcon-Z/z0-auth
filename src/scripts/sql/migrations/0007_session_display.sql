-- P2-M3: Human-readable session labels (parsed at login; not derived from hashes).

ALTER TABLE sessions
  ADD COLUMN client_label TEXT NOT NULL DEFAULT 'Unknown device',
  ADD COLUMN ip_display TEXT;

UPDATE sessions SET client_label = 'Unknown device' WHERE client_label IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('0007_session_display')
ON CONFLICT (version) DO NOTHING;
