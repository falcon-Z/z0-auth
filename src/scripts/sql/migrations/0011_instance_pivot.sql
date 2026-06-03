-- M01: single-instance model — instance_settings, instance_members, instance_invites;
-- drop multi-tenant and platform RBAC tables.

ALTER TABLE platform_settings RENAME TO instance_settings;
ALTER TABLE instance_settings RENAME COLUMN platform_name TO organization_name;
ALTER TABLE instance_settings DROP COLUMN IF EXISTS default_tenant_id;

CREATE TABLE instance_members (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_bootstrap BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE instance_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  invited_name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  invited_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT instance_invites_email_lowercase CHECK (email = lower(email))
);

CREATE UNIQUE INDEX instance_invites_token_hash_unique ON instance_invites (token_hash);

CREATE UNIQUE INDEX instance_invites_pending_email_unique
  ON instance_invites (email)
  WHERE status = 'pending';

CREATE INDEX instance_invites_status_expires_idx ON instance_invites (status, expires_at);

-- Preserve console access for upgraded instances (fresh installs have empty source tables).
INSERT INTO instance_members (user_id, joined_at, is_bootstrap)
SELECT user_id, MIN(created_at), false
FROM (
  SELECT user_id, created_at FROM platform_memberships
  UNION ALL
  SELECT user_id, created_at FROM tenant_memberships
) AS legacy_members
GROUP BY user_id
ON CONFLICT (user_id) DO NOTHING;

UPDATE instance_members
SET is_bootstrap = true
WHERE user_id = (
  SELECT pm.user_id
  FROM platform_memberships pm
  WHERE pm.role = 'platform_admin'
  ORDER BY pm.created_at ASC
  LIMIT 1
);

UPDATE instance_members
SET is_bootstrap = true
WHERE user_id = (
  SELECT user_id FROM instance_members ORDER BY joined_at ASC LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM instance_members WHERE is_bootstrap = true);

INSERT INTO instance_invites (
  email,
  invited_name,
  token_hash,
  status,
  invited_by_user_id,
  expires_at,
  accepted_at,
  declined_at,
  created_at
)
SELECT
  email,
  invited_name,
  token_hash,
  status,
  invited_by_user_id,
  expires_at,
  accepted_at,
  declined_at,
  created_at
FROM tenant_invites;

DROP TABLE IF EXISTS tenant_invites CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS tenant_memberships CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
DROP TABLE IF EXISTS platform_memberships CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;

INSERT INTO schema_migrations (version)
VALUES ('0011_instance_pivot')
ON CONFLICT (version) DO NOTHING;
