-- P1: Platform RBAC — resource scopes, roles, member assignments.

CREATE TABLE platform_resources (
  key TEXT PRIMARY KEY,
  parent_key TEXT REFERENCES platform_resources (key) ON DELETE SET NULL,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE platform_scopes (
  key TEXT PRIMARY KEY,
  resource_key TEXT NOT NULL REFERENCES platform_resources (key) ON DELETE CASCADE,
  action TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE instance_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE instance_role_scopes (
  role_id UUID NOT NULL REFERENCES instance_roles (id) ON DELETE CASCADE,
  scope_key TEXT NOT NULL REFERENCES platform_scopes (key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, scope_key)
);

CREATE TABLE instance_member_roles (
  member_user_id UUID NOT NULL REFERENCES instance_members (user_id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES instance_roles (id) ON DELETE CASCADE,
  granted_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_user_id, role_id)
);

CREATE TABLE instance_invite_roles (
  invite_id UUID NOT NULL REFERENCES instance_invites (id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES instance_roles (id) ON DELETE CASCADE,
  PRIMARY KEY (invite_id, role_id)
);

CREATE INDEX instance_member_roles_role_id_idx ON instance_member_roles (role_id);
CREATE INDEX instance_invite_roles_invite_id_idx ON instance_invite_roles (invite_id);

-- Resource catalog
INSERT INTO platform_resources (key, parent_key, label, sort_order) VALUES
  ('instance', NULL, 'Instance', 10),
  ('members', NULL, 'Team', 20),
  ('roles', NULL, 'Roles', 30),
  ('ownership', NULL, 'Ownership', 40),
  ('apps', NULL, 'Applications', 50),
  ('apps.credentials', 'apps', 'App credentials', 51),
  ('apps.scopes', 'apps', 'App permissions', 52),
  ('apps.users', 'apps', 'App users', 53),
  ('settings.email', NULL, 'Email settings', 60),
  ('settings.security', NULL, 'Security settings', 70),
  ('audit', NULL, 'Activity log', 80);

INSERT INTO platform_scopes (key, resource_key, action, label, description) VALUES
  ('instance:read', 'instance', 'read', 'View instance', 'View dashboard and instance summary'),
  ('members:read', 'members', 'read', 'View team', 'List team members and invitations'),
  ('members:invite', 'members', 'invite', 'Invite members', 'Send and revoke team invitations'),
  ('members:remove', 'members', 'remove', 'Remove members', 'Remove people from the team'),
  ('roles:read', 'roles', 'read', 'View roles', 'View roles and what they can do'),
  ('roles:manage', 'roles', 'manage', 'Manage roles', 'Create roles and change member role assignments'),
  ('ownership:transfer', 'ownership', 'transfer', 'Transfer ownership', 'Transfer instance ownership to another member'),
  ('apps:read', 'apps', 'read', 'View apps', 'View registered applications'),
  ('apps:create', 'apps', 'create', 'Create apps', 'Register new applications'),
  ('apps:update', 'apps', 'update', 'Update apps', 'Edit application settings'),
  ('apps:delete', 'apps', 'delete', 'Delete apps', 'Disable or remove applications'),
  ('apps.credentials:read', 'apps.credentials', 'read', 'View credentials', 'View app client credentials'),
  ('apps.credentials:create', 'apps.credentials', 'create', 'Create credentials', 'Create app client credentials'),
  ('apps.credentials:rotate', 'apps.credentials', 'rotate', 'Rotate credentials', 'Rotate client secrets'),
  ('apps.credentials:revoke', 'apps.credentials', 'revoke', 'Revoke credentials', 'Revoke client credentials'),
  ('apps.scopes:read', 'apps.scopes', 'read', 'View app scopes', 'View app permission scopes'),
  ('apps.scopes:manage', 'apps.scopes', 'manage', 'Manage app scopes', 'Create and edit app permission scopes'),
  ('apps.users:read', 'apps.users', 'read', 'View app users', 'View end users for an application'),
  ('apps.users:manage', 'apps.users', 'manage', 'Manage app users', 'Create, invite, and update app users'),
  ('settings.email:read', 'settings.email', 'read', 'View email settings', 'View SMTP configuration'),
  ('settings.email:update', 'settings.email', 'update', 'Update email settings', 'Change SMTP configuration'),
  ('settings.security:read', 'settings.security', 'read', 'View security settings', 'View security configuration'),
  ('audit:read', 'audit', 'read', 'View activity', 'View audit and activity logs');

-- System roles
INSERT INTO instance_roles (key, name, description, is_system) VALUES
  ('owner', 'Owner', 'Full access including ownership transfer', true),
  ('admin', 'Admin', 'Manage team, apps, and settings', true),
  ('developer', 'Developer', 'Build and manage applications', true),
  ('viewer', 'Viewer', 'Read-only access to the console', true);

-- Owner: all scopes
INSERT INTO instance_role_scopes (role_id, scope_key)
SELECT r.id, s.key
FROM instance_roles r
CROSS JOIN platform_scopes s
WHERE r.key = 'owner';

-- Admin: all except ownership transfer
INSERT INTO instance_role_scopes (role_id, scope_key)
SELECT r.id, s.key
FROM instance_roles r
CROSS JOIN platform_scopes s
WHERE r.key = 'admin' AND s.key <> 'ownership:transfer';

-- Developer
INSERT INTO instance_role_scopes (role_id, scope_key)
SELECT r.id, s.key
FROM instance_roles r
JOIN platform_scopes s ON s.key IN (
  'instance:read',
  'members:read',
  'apps:read', 'apps:create', 'apps:update', 'apps:delete',
  'apps.credentials:read', 'apps.credentials:create', 'apps.credentials:rotate', 'apps.credentials:revoke',
  'apps.scopes:read', 'apps.scopes:manage',
  'apps.users:read', 'apps.users:manage',
  'settings.security:read'
)
WHERE r.key = 'developer';

-- Viewer: read scopes only
INSERT INTO instance_role_scopes (role_id, scope_key)
SELECT r.id, s.key
FROM instance_roles r
JOIN platform_scopes s ON s.key LIKE '%:read'
WHERE r.key = 'viewer';

-- Backfill member roles
INSERT INTO instance_member_roles (member_user_id, role_id)
SELECT m.user_id, r.id
FROM instance_members m
JOIN instance_roles r ON r.key = CASE WHEN m.is_bootstrap THEN 'owner' ELSE 'developer' END;

-- Backfill pending invites with Developer role
INSERT INTO instance_invite_roles (invite_id, role_id)
SELECT i.id, r.id
FROM instance_invites i
JOIN instance_roles r ON r.key = 'developer'
WHERE i.status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM instance_invite_roles ir WHERE ir.invite_id = i.id
  );

INSERT INTO schema_migrations (version)
VALUES ('0018_platform_rbac')
ON CONFLICT (version) DO NOTHING;
