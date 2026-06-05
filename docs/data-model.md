# Data model (single-instance IAM)

One z0-auth deployment serves one account owner team and their registered apps. There is no multi-tenant org model inside an instance.

## Terminology

| Term | Meaning |
|------|---------|
| instance | One deployed z0-auth service |
| instance member | Console operator with full platform access in v1 |
| organization | Display name stored on the instance (from setup) |
| app | Registered client application |
| app user | End user who signs in through `/auth` for **one** app — isolated from other apps and from console |

## Two identity realms (locked)

| Realm | Who | Storage | Email unique |
|-------|-----|---------|--------------|
| **Console** | Developers operating this IAM instance | `users` + `password_credentials` + `instance_members` | Globally on `users` |
| **App** | End users of a registered app | `app_users` per `app_id` | Per app: `(app_id, email)` |

**Option B:** Apps do not share end-user identities. The same email on App A and App B is **two accounts**, two passwords, two sign-in flows. Console `users` are not used for app sign-in.

## Authorization (v1)

Console and instance APIs: signed in **and** `instance_members`.

App sign-in (M06+): credentials and sessions scoped to **one `app_id`** — no cross-app access. App users may **self-register** (not invite-only) when signing in with app context (`client_id`).

**Hosted auth (one UI, two realms):** Same `/auth/*` pages and form patterns as console login. **Realm** is chosen by context:

| Context | How resolved | Identity table | Session cookie |
|---------|--------------|----------------|----------------|
| Console | No `client_id` / no app context | `users` | `z0_session` → `sessions` |
| App user | `client_id` on authorize/login/register (→ `app_id`) | `app_users` | `z0_app_session` → `app_user_sessions` |

Matches common IAM products (Auth0 Universal Login, Clerk hosted): one authentication layer; app context selects the user directory.

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

### `app_users` (M05 — target, Option B)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | App-local identity (not `users.id`) |
| `app_id` | UUID → `apps` | CASCADE delete |
| `email` | TEXT | Lowercase; **unique per app** with `app_id` |
| `name` | TEXT | |
| `password_hash` | TEXT | Argon2id; belongs to this app account only |
| `status` | TEXT | `active`, `disabled` |
| `metadata` | JSONB | Optional (max 4 KB in API) |
| `email_verified_at` | TIMESTAMPTZ | Optional |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

Unique `(app_id, lower(email))`. No FK to `users`.

### `app_user_invites` (M05)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `app_id` | UUID → `apps` | |
| `email` | TEXT | Lowercase; pending invite for this app only |
| `invited_name` | TEXT | |
| `token_hash` | TEXT | Unique |
| `status` | TEXT | `pending`, `accepted`, `declined`, `revoked` |
| `invited_by_user_id` | UUID → `users` | Console operator who sent invite |
| `expires_at` | TIMESTAMPTZ | |
| `accepted_at`, `declined_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

Accept creates a row in `app_users` only. Unique pending invite per `(app_id, email)`.

Self-registration (M06) also creates `app_users` directly when `client_id` resolves to the app — same uniqueness rules as console-created users.

### `app_user_sessions` (M06)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `app_user_id` | UUID → `app_users` | CASCADE delete |
| `app_id` | UUID → `apps` | Denormalized for enforcement; must match `app_users.app_id` |
| `token_hash` | TEXT | Unique |
| `expires_at` | TIMESTAMPTZ | 14-day absolute lifetime (same as console) |
| `created_at`, `last_seen_at` | TIMESTAMPTZ | |
| `revoked_at` | TIMESTAMPTZ | Logout / security revoke |
| `ip_hash`, `user_agent_hash`, `client_label`, `ip_display` | TEXT | Same display pattern as `sessions` |

Cookie `z0_app_session` (HttpOnly, SameSite=Lax). OAuth and `/auth` resume read this cookie — not `z0_session`. A browser may hold both cookies when an operator tests an app while signed into the console.

### `app_memberships` (0015 — superseded)

Bridged global `users` to apps. **Do not build on this.** Removed in migration `0016` when Option B ships.

### Later modules

| Table | Purpose |
|-------|---------|
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
| App users (M05) | `GET/POST /api/v1/apps/:appId/users` — `userId` is `app_users.id`, not global `users.id` |
| App user invites (public) | `GET /api/v1/app-invites/:token`, `POST accept/decline` |
| Email settings (M08) | `GET/PUT /api/v1/settings/email`, `POST …/email/test` |
| Password reset (M08) | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` (when SMTP enabled) |
| App user hosted auth (M06) | `/auth/login`, `/auth/register` with `client_id`; `/auth/app-invite/:token` |
| Console session | `z0_session` — `isInstanceMember`, `organizationName` |
| App user session | `z0_app_session` — scoped to one `app_id`; no console access |

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [api/security-contract.md](./api/security-contract.md)
