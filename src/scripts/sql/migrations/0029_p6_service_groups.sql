-- P6: Grouped services (app groups + SSO)

CREATE TABLE service_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sso_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_groups_slug_lowercase CHECK (slug = lower(slug))
);

CREATE UNIQUE INDEX service_groups_slug_unique ON service_groups (slug);

CREATE TABLE service_group_apps (
  group_id UUID NOT NULL REFERENCES service_groups (id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, app_id)
);

CREATE UNIQUE INDEX service_group_apps_app_unique ON service_group_apps (app_id);

CREATE TABLE service_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES service_groups (id) ON DELETE CASCADE,
  primary_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_group_members_email_lowercase CHECK (primary_email = lower(primary_email))
);

CREATE UNIQUE INDEX service_group_members_group_email_unique
  ON service_group_members (group_id, primary_email);

CREATE TABLE service_group_app_users (
  group_member_id UUID NOT NULL REFERENCES service_group_members (id) ON DELETE CASCADE,
  app_user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_member_id, app_id),
  CONSTRAINT service_group_app_users_user_unique UNIQUE (app_user_id)
);

CREATE INDEX service_group_app_users_member_idx ON service_group_app_users (group_member_id);

INSERT INTO platform_resources (key, parent_key, label, sort_order) VALUES
  ('settings.service_groups', NULL, 'App groups', 63)
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_scopes (key, resource_key, action, label, description) VALUES
  ('settings.service_groups:read', 'settings.service_groups', 'read', 'View app groups', 'View grouped services and SSO settings'),
  ('settings.service_groups:create', 'settings.service_groups', 'create', 'Create app groups', 'Create grouped services'),
  ('settings.service_groups:update', 'settings.service_groups', 'update', 'Manage app groups', 'Update groups, assign apps, toggle SSO'),
  ('settings.service_groups:delete', 'settings.service_groups', 'delete', 'Delete app groups', 'Remove grouped services')
ON CONFLICT (key) DO NOTHING;

INSERT INTO instance_role_scopes (role_id, scope_key)
SELECT r.id, s.key
FROM instance_roles r
CROSS JOIN platform_scopes s
WHERE r.key IN ('owner', 'admin')
  AND s.key LIKE 'settings.service_groups:%'
ON CONFLICT DO NOTHING;

INSERT INTO instance_role_scopes (role_id, scope_key)
SELECT r.id, s.key
FROM instance_roles r
CROSS JOIN platform_scopes s
WHERE r.key = 'developer'
  AND s.key = 'settings.service_groups:read'
ON CONFLICT DO NOTHING;

INSERT INTO instance_role_scopes (role_id, scope_key)
SELECT r.id, s.key
FROM instance_roles r
CROSS JOIN platform_scopes s
WHERE r.key = 'viewer'
  AND s.key = 'settings.service_groups:read'
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('0029_p6_service_groups')
ON CONFLICT (version) DO NOTHING;
