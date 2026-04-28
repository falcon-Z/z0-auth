# Z0 Auth Database Schema

## Overview

PostgreSQL schema for Z0 Auth, designed for:
- Multi-tenant architecture (3-level hierarchy: Platform → Tenants → Apps → Identities)
- Compliance and audit (soft-delete strategy per Phase 0)
- Token lifecycle and replay detection
- Rate limiting and authorization
- SMTP configuration and magic link state machine
- OIDC consent grants (Phase 1.x)

## Phase 0 Design Decisions Applied

- **ID Generation**: PostgreSQL UUID generation (triggers)
- **Soft-Delete Strategy**: Soft-delete on: identities, sessions, credentials, API keys, consent grants, audit events, tenants, apps
- **Audit Retention**: 90 days (configurable per tenant in v1.1)
- **API Key Hashing**: Argon2id (implemented as PBKDF2 pending Bun crypto upgrade)
- **Access Token Claims**: `{sub, aud, scope, tenant_id, app_id, session_id, iat, exp}`

---

## Table Groups

### 1. Platform Administration

```sql
CREATE TABLE platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,  -- Soft delete
  UNIQUE(name)
);

CREATE TABLE platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id),
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR NOT NULL,
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,  -- Soft delete
  UNIQUE(platform_id, email)
);

CREATE TABLE bootstrap_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id),
  token_hash VARCHAR NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
  -- No soft delete: one-time use only
);
```

### 2. Tenancy

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES platforms(id),
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,  -- Soft delete
  UNIQUE(platform_id, name)
);

CREATE TABLE tenant_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR NOT NULL,
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,  -- Soft delete
  UNIQUE(tenant_id, email)
);
```

### 3. Applications

```sql
CREATE TABLE apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id VARCHAR(255) NOT NULL,
  client_secret_hash VARCHAR NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  allowed_redirect_uris TEXT[] NOT NULL,
  allowed_origins TEXT[] DEFAULT '{}',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,  -- Soft delete
  UNIQUE(tenant_id, client_id)
);

CREATE TABLE app_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id),
  sso_enabled BOOLEAN DEFAULT FALSE,
  mfa_required BOOLEAN DEFAULT FALSE,
  session_max_age_seconds INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4. Identities & Credentials

```sql
CREATE TABLE identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id),
  email VARCHAR(254) NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  email_verified_at TIMESTAMP,
  name VARCHAR(255),
  picture VARCHAR,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,  -- Soft delete
  UNIQUE(app_id, email)
);

CREATE TABLE credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identities(id),
  type VARCHAR(50) NOT NULL,  -- 'password', 'totp', 'passkey', etc.
  secret_hash VARCHAR,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,  -- Soft delete
  UNIQUE(identity_id, type)
);
```

### 5. Sessions & Tokens

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identities(id),
  app_id UUID NOT NULL REFERENCES apps(id),
  user_agent VARCHAR,
  ip_address INET,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  deleted_at TIMESTAMP,  -- Soft delete
  INDEX(identity_id, expires_at)
);

-- Refresh token family: track token lineage for replay detection
CREATE TABLE refresh_token_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  parent_token_id UUID,  -- NULL for first token in family
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP  -- Hard delete after expiry
);

-- Refresh token instances: individual tokens in a family
CREATE TABLE refresh_token_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES refresh_token_families(id),
  token_hash VARCHAR NOT NULL,
  issued_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  rotated_token_id UUID,  -- Next token if rotated
  deleted_at TIMESTAMP,  -- Soft delete
  UNIQUE(token_hash)
);

-- Revoked access tokens (for logout and token expiration)
CREATE TABLE access_token_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  token_hash VARCHAR NOT NULL,
  revoked_at TIMESTAMP NOT NULL,
  deleted_at TIMESTAMP,  -- Soft delete (after exp + retention)
  UNIQUE(token_hash)
);
```

### 6. API Keys

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id),
  key_id VARCHAR(255) NOT NULL,
  secret_hash VARCHAR NOT NULL,
  name VARCHAR(255),
  scopes TEXT[] DEFAULT '{}',
  last_used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,  -- Soft delete
  UNIQUE(app_id, key_id)
);
```

### 7. Rate Limiting

```sql
CREATE TABLE rate_limit_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  limit_class VARCHAR(50) NOT NULL,  -- 'bootstrap', 'identity', 'platform', etc.
  identifier VARCHAR(255) NOT NULL,  -- IP, user ID, app ID, etc.
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMP NOT NULL,
  window_end TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(limit_class, identifier, window_start)
);
```

### 8. SMTP Configuration & Magic Links

```sql
-- SMTP configuration state machine
CREATE TABLE smtp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  status VARCHAR(50) DEFAULT 'unconfigured',  -- 'unconfigured', 'configured', 'misconfigured'
  host VARCHAR(255),
  port INTEGER,
  username VARCHAR(255),
  password_encrypted VARCHAR,
  from_email VARCHAR(254),
  tls_enabled BOOLEAN DEFAULT TRUE,
  tested_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id)
);

CREATE TABLE magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identities(id),
  token_hash VARCHAR NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  UNIQUE(token_hash),
  INDEX(identity_id, expires_at)
);
```

### 9. Consent Grants (Phase 1.x)

```sql
-- OIDC consent tracking for authorization delegation
CREATE TABLE consent_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identities(id),
  app_id UUID NOT NULL REFERENCES apps(id),
  scopes TEXT[] NOT NULL,
  granted_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP,
  deleted_at TIMESTAMP,  -- Soft delete
  UNIQUE(identity_id, app_id)
);
```

### 10. Audit Logging

```sql
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  actor_id UUID,  -- Platform admin, tenant admin, identity, app, or NULL for system
  actor_type VARCHAR(50),  -- 'platform', 'tenant', 'identity', 'app', 'system'
  action VARCHAR(100) NOT NULL,  -- 'identity_created', 'credential_verified', 'session_revoked', etc.
  resource_type VARCHAR(50),  -- 'identity', 'credential', 'session', 'api_key', etc.
  resource_id UUID,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent VARCHAR,
  status VARCHAR(50),  -- 'success', 'failure'
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,  -- Soft delete (after 90 days via retention policy)
  INDEX(tenant_id, created_at)
);

-- Retention policy enforcement
CREATE TABLE audit_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  retention_days INTEGER DEFAULT 90,
  last_cleanup_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id)
);
```

---

## Migration Strategy

1. **Forward-only migrations**: Never rollback in production
2. **Immutable history**: Each migration file is immutable once deployed
3. **Startup drift checks**: Verify schema matches expected state on service start
4. **Zero-downtime**: Migrations tested for online execution (no locks on critical tables)

---

## Indexes

### Query Optimization Indexes

```sql
-- Frequently queried paths
CREATE INDEX idx_identities_app_email ON identities(app_id, email) WHERE deleted_at IS NULL;
CREATE INDEX idx_sessions_identity_app ON sessions(identity_id, app_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_credentials_identity_type ON credentials(identity_id, type) WHERE deleted_at IS NULL;
CREATE INDEX idx_api_keys_app ON api_keys(app_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_audit_events_tenant_time ON audit_events(tenant_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_refresh_tokens_session ON refresh_token_instances(family_id, expires_at) WHERE deleted_at IS NULL;
```

---

## Constraints & Triggers

### Automatic Timestamps

```sql
-- created_at is set on INSERT
-- updated_at is set on INSERT or UPDATE
-- deleted_at remains NULL until soft-delete
```

---

## Migration Numbering Scheme

```
database/
  migrations/
    0001_bootstrap.sql       -- Platform, admins, bootstrap tokens
    0002_tenancy.sql         -- Tenants, tenant admins
    0003_apps.sql            -- Apps, app config
    0004_identities.sql      -- Identities, credentials
    0005_sessions.sql        -- Sessions, tokens, revocation
    0006_api_keys.sql        -- API keys
    0007_rate_limit.sql      -- Rate limiting
    0008_smtp_magic.sql      -- SMTP, magic links
    0009_consent.sql         -- Consent grants (Phase 1.x)
    0010_audit.sql           -- Audit logging
    0011_retention.sql       -- Retention policies and triggers
```

---

## Phase 2 Implementation Plan

1. Create migration files (0001-0011) with complete SQL
2. Implement migration runner in Bun (using bun:sqlite or pg driver)
3. Add drift detection on service startup
4. Create seed fixtures for deterministic testing
5. Implement retention cleanup jobs

---

## Known Constraints

- **No cross-tenant queries**: All queries include tenant_id filter
- **Session expiry enforcement**: Expired sessions cleaned up by retention job (not hard-deleted immediately)
- **Token replay detection**: Refresh token families track lineage; out-of-order rotation detected
- **Soft-delete performance**: Queries must filter `WHERE deleted_at IS NULL` (enforced via triggers/views in future)
