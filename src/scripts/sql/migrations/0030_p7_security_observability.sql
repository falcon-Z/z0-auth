-- P7: Security & observability (audit access + session management scopes)

CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events (created_at DESC);

INSERT INTO platform_resources (key, parent_key, label, sort_order) VALUES
  ('settings.audit', NULL, 'Audit log', 64)
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_scopes (key, resource_key, action, label, description) VALUES
  ('settings.audit:read', 'settings.audit', 'read', 'View audit log', 'View security and configuration audit events')
ON CONFLICT (key) DO NOTHING;

INSERT INTO instance_role_scopes (role_id, scope_key)
SELECT r.id, s.key
FROM instance_roles r
CROSS JOIN platform_scopes s
WHERE r.key IN ('owner', 'admin')
  AND s.key = 'settings.audit:read'
ON CONFLICT DO NOTHING;

INSERT INTO instance_role_scopes (role_id, scope_key)
SELECT r.id, s.key
FROM instance_roles r
CROSS JOIN platform_scopes s
WHERE r.key = 'developer'
  AND s.key = 'settings.audit:read'
ON CONFLICT DO NOTHING;
