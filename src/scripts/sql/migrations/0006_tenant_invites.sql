-- P2-M1: organization invites (invite-only onboarding).

CREATE TABLE tenant_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_name TEXT NOT NULL,
  role_keys TEXT[] NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  invited_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_invites_email_lowercase CHECK (email = lower(email))
);

CREATE UNIQUE INDEX tenant_invites_pending_tenant_email_unique
  ON tenant_invites (tenant_id, email)
  WHERE status = 'pending';

CREATE INDEX tenant_invites_tenant_status_idx ON tenant_invites (tenant_id, status);

INSERT INTO schema_migrations (version)
VALUES ('0006_tenant_invites')
ON CONFLICT (version) DO NOTHING;
