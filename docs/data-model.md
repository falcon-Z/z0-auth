# Data model (single-instance IAM)

One z0-auth deployment serves one account owner team and their registered apps. There is no multi-tenant org model inside an instance.

## Terminology

| Term | Meaning |
|------|---------|
| instance | One deployed z0-auth service |
| instance member | Console operator with full platform access in v1 |
| organization | Display name stored on the instance (from setup) |
| app | Registered client application |
| app user | End user who signs in through `/auth` for an app |

## Authorization (v1)

Console and instance APIs: user is signed in **and** has a row in `instance_members`.

No role tiers, permission matrix, or organization switcher.

## Tables

### `instance_settings` (singleton, `id = 1`)

| Column | Type | Notes |
|--------|------|-------|
| `organization_name` | TEXT | From setup |
| `setup_completed_at` | TIMESTAMPTZ | NULL until first setup |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

### `instance_members`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | UUID PK → `users` | |
| `joined_at` | TIMESTAMPTZ | |
| `is_bootstrap` | BOOLEAN | First setup user |

### `instance_invites`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `email` | TEXT | Lowercase constraint |
| `invited_name` | TEXT | |
| `token_hash` | TEXT | Unique |
| `status` | TEXT | `pending`, `accepted`, `declined`, `revoked` |
| `invited_by_user_id` | UUID → `users` | Nullable |
| `expires_at` | TIMESTAMPTZ | |
| `accepted_at`, `declined_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

Unique pending invite per email (partial index).

Accepting an invite inserts `instance_members` (no roles).

### Identity & sessions

| Table | Purpose |
|-------|---------|
| `users` | Person identity |
| `password_credentials` | Password hashes |
| `sessions` | Session tokens |

### Apps (unchanged intent for later modules)

| Table | Purpose |
|-------|---------|
| `apps` | Registered applications |
| `app_credentials` | Client credentials |
| `app_memberships` | App user ↔ app |
| `smtp_settings` | SMTP config |
| `audit_events` | Audit trail (`tenant_id` column unused, always NULL in v1) |

## Setup flow

1. Create `users` + `password_credentials`
2. Insert `instance_members` with `is_bootstrap = true`
3. Set `instance_settings.organization_name` and `setup_completed_at`

## Removed (migration `0011_instance_pivot`)

- `tenants`, `tenant_memberships`, `tenant_invites`
- `platform_memberships`, `platform_settings` (renamed)
- `permissions`, `roles`, `role_permissions`, `user_roles`
- `user_preferences` (active tenant)

## API shape (M01)

| Area | Routes |
|------|--------|
| Members | `GET/POST /api/v1/members`, `GET /api/v1/members/invites`, `DELETE /api/v1/members/invites/:id`, `DELETE /api/v1/members/:userId` |
| Invites (public token) | `GET /api/v1/invites/:token`, `POST accept/decline` |
| Session | `isInstanceMember`, `organizationName` — no tenant or permissions |

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [api/security-contract.md](./api/security-contract.md)
