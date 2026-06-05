-- M05: app end users — membership per application and app-scoped invites.

CREATE TABLE app_memberships (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  metadata JSONB,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, app_id)
);

CREATE INDEX app_memberships_app_id_idx ON app_memberships (app_id);
CREATE INDEX app_memberships_app_status_idx ON app_memberships (app_id, status);

CREATE TABLE app_user_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps (id) ON DELETE CASCADE,
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
  CONSTRAINT app_user_invites_email_lowercase CHECK (email = lower(email))
);

CREATE UNIQUE INDEX app_user_invites_token_hash_unique ON app_user_invites (token_hash);

CREATE UNIQUE INDEX app_user_invites_pending_app_email_unique
  ON app_user_invites (app_id, email)
  WHERE status = 'pending';

CREATE INDEX app_user_invites_app_status_expires_idx
  ON app_user_invites (app_id, status, expires_at);
