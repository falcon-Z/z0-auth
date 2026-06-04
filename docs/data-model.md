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

### `apps` (M03)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | TEXT | Display name |
| `slug` | TEXT | Unique URL-safe id (from name; suffix on conflict) |
| `redirect_uris` | TEXT[] | OAuth redirect allow-list (exact match at authorize time) |
| `status` | TEXT | `active`, `disabled` |
| `disabled_at` | TIMESTAMPTZ | Set when disabled |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

### `app_scopes` (M04)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `app_id` | UUID → `apps` | CASCADE delete |
| `name` | TEXT | Lowercase identifier (`read:orders`, `openid`); unique per app |
| `description` | TEXT | Optional operator note (max 256 chars in API) |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

Unique `(app_id, name)`. Used as the allow-list for OAuth `scope` requests (Phase 4).

### `app_credentials` (M03)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `app_id` | UUID → `apps` | CASCADE delete |
| `client_id` | TEXT | Unique public id (`z0_…`) |
| `client_secret_hash` | TEXT | Argon2id; plaintext shown once on create/rotate |
| `label` | TEXT | Default `Default` |
| `status` | TEXT | `active`, `revoked` |
| `revoked_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

### `smtp_settings` (M08)

Singleton row (`id = 1`). Outbound email for password reset and test send.

| Column | Type | Notes |
|--------|------|-------|
| `host` | TEXT | SMTP server |
| `port` | INTEGER | Default 587 |
| `encryption` | TEXT | `none`, `starttls`, `tls` |
| `username` | TEXT | Optional |
| `password_ciphertext` | TEXT | AES-GCM; never returned by API |
| `from_address` | TEXT | From header |
| `from_name` | TEXT | Optional display name |
| `enabled` | BOOLEAN | Master switch |
| `verified_at` | TIMESTAMPTZ | Set after successful test send |

### `password_reset_tokens` (M08)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID → `users` | |
| `token_hash` | TEXT | Reset `jti` (matches signed token payload; signature verified with instance Ed25519 public key) |
| `expires_at` | TIMESTAMPTZ | 1 hour TTL |
| `used_at` | TIMESTAMPTZ | Single-use |

### Later modules

| Table | Purpose |
|-------|---------|
| `app_memberships` | App user ↔ app (M05) |
| `audit_events` | Audit trail (`tenant_id` unused, NULL in v1) |

## Setup flow

1. Create `users` + `password_credentials`
2. Insert `instance_members` with `is_bootstrap = true`
3. Set `instance_settings.organization_name` and `setup_completed_at`

## Removed (migration `0011_instance_pivot`)

- `tenants`, `tenant_memberships`, `tenant_invites`
- `platform_memberships`, `platform_settings` (renamed)
- `permissions`, `roles`, `role_permissions`, `user_roles`
- `user_preferences` (active tenant)

## API shape

| Area | Routes |
|------|--------|
| Members (M01) | `GET/POST /api/v1/members`, `GET /api/v1/members/invites`, `DELETE /api/v1/members/invites/:id`, `DELETE /api/v1/members/:userId` |
| Invites (public token) | `GET /api/v1/invites/:token`, `POST accept/decline` |
| Applications (M03) | `GET/POST /api/v1/apps`, `GET/PATCH /api/v1/apps/:appId`, credential CRUD under `…/credentials` |
| App scopes (M04) | `GET/POST /api/v1/apps/:appId/scopes`, `PATCH/DELETE …/scopes/:scopeId` |
| Email settings (M08) | `GET/PUT /api/v1/settings/email`, `POST …/email/test` |
| Password reset (M08) | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` (when SMTP enabled) |
| Session | `isInstanceMember`, `organizationName` — no tenant or permissions |

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [api/security-contract.md](./api/security-contract.md)
