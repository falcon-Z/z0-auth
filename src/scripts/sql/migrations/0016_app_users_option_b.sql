-- M05 Option B: app-local identities (`app_users`) and retirement of app_memberships.

CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  metadata JSONB,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_users_email_lowercase CHECK (email = lower(email))
);

CREATE UNIQUE INDEX app_users_app_id_email_unique ON app_users (app_id, lower(email));
CREATE INDEX app_users_app_id_status_idx ON app_users (app_id, status);

-- Backfill from the legacy model while preserving historical membership metadata.
INSERT INTO app_users (
  app_id,
  email,
  name,
  password_hash,
  status,
  metadata,
  email_verified_at,
  created_at,
  updated_at
)
SELECT
  m.app_id,
  u.email,
  u.name,
  pc.password_hash,
  m.status,
  m.metadata,
  u.email_verified_at,
  m.created_at,
  m.updated_at
FROM app_memberships m
JOIN users u ON u.id = m.user_id
JOIN password_credentials pc ON pc.user_id = u.id
WHERE NOT EXISTS (
  SELECT 1
  FROM app_users au
  WHERE au.app_id = m.app_id
    AND lower(au.email) = lower(u.email)
);

DROP TABLE app_memberships;

INSERT INTO schema_migrations (version)
VALUES ('0016_app_users_option_b')
ON CONFLICT (version) DO NOTHING;
