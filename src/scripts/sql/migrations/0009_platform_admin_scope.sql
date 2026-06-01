-- Platform roles must not bundle org-scoped permissions; tenant access is via tenant roles only.

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.key = 'platform_admin'
  AND r.scope = 'platform'
  AND NOT (p.key LIKE 'platform:%' OR p.key = 'tenants:create');

INSERT INTO schema_migrations (version)
VALUES ('0009_platform_admin_scope')
ON CONFLICT (version) DO NOTHING;
