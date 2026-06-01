-- P2-M5: Split platform:manage, seed platform_manager, tenant_manager invite cap in DB.

INSERT INTO permissions (key, description) VALUES
  ('platform:users:read', 'View all platform users'),
  ('platform:users:write', 'Enable or disable platform users'),
  ('platform:sessions:revoke', 'Revoke any user session (support)'),
  ('platform:tenants:read', 'View organization metadata across the instance')
ON CONFLICT (key) DO NOTHING;

-- platform_admin: every permission (replaces legacy platform:manage bundle).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'platform_admin' AND r.scope = 'platform'
ON CONFLICT DO NOTHING;

-- platform_manager: support read + session revoke (no user write, no org create).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key IN (
  'platform:users:read',
  'platform:tenants:read',
  'platform:sessions:revoke'
)
WHERE r.key = 'platform_manager' AND r.scope = 'platform'
ON CONFLICT DO NOTHING;

-- tenant_manager may invite (escalation rules enforced in application code).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key = 'users:invite'
WHERE r.key = 'tenant_manager' AND r.scope = 'tenant'
ON CONFLICT DO NOTHING;

-- Remove deprecated mega-permission from all role bundles.
DELETE FROM role_permissions rp
USING permissions p
WHERE rp.permission_id = p.id AND p.key = 'platform:manage';

DELETE FROM permissions WHERE key = 'platform:manage';
