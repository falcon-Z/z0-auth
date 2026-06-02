-- Add explicit platform-level tenant management permission.

INSERT INTO permissions (key, description) VALUES
  ('platform:tenants:manage', 'Manage tenant members and invitations across the instance')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key = 'platform:tenants:manage'
WHERE r.key = 'platform_admin' AND r.scope = 'platform'
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('0010_platform_tenant_manage')
ON CONFLICT (version) DO NOTHING;
