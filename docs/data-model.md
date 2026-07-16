# Data model (single-instance IAM)

One z0-auth deployment serves one account owner team and their registered apps. There is no multi-tenant org model inside an instance.

## Terminology

| Term | Meaning |
|------|---------|
| instance | One deployed z0-auth service |
| instance member | Console operator; access controlled by assigned roles |
| instance owner | First setup user (`is_bootstrap`); cannot be removed |
| organization | Display name stored on the instance (from setup) |
| app | Registered client application |
| app user | End user who signs in through `/auth` for **one** app — isolated from other apps and from console |

## Two identity realms (locked)

| Realm | Who | Storage | Email unique |
|-------|-----|---------|--------------|
| **Console** | Developers operating this IAM instance | `users` + `password_credentials` + `instance_members` | Globally on `users` |
| **App** | End users of a registered app | `app_users` per `app_id` | Per app: `(app_id, email)` |

**Option B:** Apps do not share end-user identities by default. The same email on App A and App B is **two accounts**, two passwords, two sign-in flows. Console `users` are not used for app sign-in.

**Group SSO exception (P6):** When apps belong to an SSO-enabled **service group**, end users share a **group member** identity across those apps only. Signing in to one app allows opening sibling apps without signing in again (consent granted on any group app covers siblings). Apps outside the group remain isolated.

## Authorization (v1)

Console APIs require a signed-in **instance member** with the required **platform scope**. Effective scopes are the union of all assigned **roles** (Owner, Admin, Developer, Viewer, plus custom roles). The bootstrap owner (`is_bootstrap`) always has full access and is the only member who can transfer ownership.

App sign-in (M06+): credentials and sessions scoped to **one `app_id`** — no cross-app access. App users may **self-register** (not invite-only) when signing in with app context (`client_id`).

**Hosted auth (one UI, two sign-in modes):** Same `/auth/*` pages as console login. **App context** (`client_id` from your app’s OAuth redirect) decides who we authenticate:

| Sign-in for | How we know | Identity table | Session cookie |
|-------------|-------------|----------------|----------------|
| **Console** (your team) | No `client_id` | `users` | `z0_session` |
| **App end users** | `client_id` → `app_id` | `app_users` | `z0_app_session` |

Auth0 Universal Login / Clerk hosted pages work the same way: one login UI; the app’s client id picks the user directory. Social buttons (Google, Apple, GitHub, Facebook, or custom OIDC) appear on the **app** hosted page when enabled for that app.

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
| `is_bootstrap` | BOOLEAN | First setup user (owner) |

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

`users` is the console identity realm. Lifecycle columns are `disabled_at`, `locked_until`, and `deleted_at`, with operator actor IDs for disable/delete and bounded failed-sign-in counters. APIs derive `active`, `disabled`, `locked`, or `deleted` from these timestamps. A recoverably deleted user keeps its `instance_members` row and reserved email. Permanent deletion cascades credentials, membership, roles, sessions, and reset tokens.

### Multi-factor authentication

MFA storage is realm-separated:

| Console tables | App-user tables | Purpose |
|---|---|---|
| `user_totp_factors` | `app_user_totp_factors` | One encrypted TOTP seed per identity, confirmation time, and last accepted time step |
| `user_mfa_recovery_codes` | `app_user_mfa_recovery_codes` | Hashed single-use recovery codes |
| `user_mfa_challenges` | `app_user_mfa_challenges` | Hashed five-minute pre-authentication challenges and attempt counts |
| `user_mfa_remembered_browsers` | `app_user_mfa_remembered_browsers` | Hashed rotating 30-day remembered tokens and safe device labels |

App-user rows include `app_id` and composite foreign keys so a factor or challenge cannot cross an app boundary. `sessions` and `app_user_sessions` record primary authentication time, recent MFA time, and authentication method. Full sessions are inserted only after the MFA challenge is consumed when a factor is enabled.

### Passkeys (`0039_passkeys`)

Passkey storage is also realm-separated:

| Console tables | App-user tables | Purpose |
|---|---|---|
| `user_passkey_handles` | `app_user_passkey_handles` | Stable opaque WebAuthn user handles; app rows include `app_id` |
| `user_passkeys` | `app_user_passkeys` | Public credential key, algorithm, counter, label, transports, backup flags, and lifecycle timestamps |
| `user_passkey_ceremonies` | `app_user_passkey_ceremonies` | Hashed, single-use registration, authentication, and step-up challenges |

`passkey_credential_registry` enforces credential-ID uniqueness across both realms and keeps a tombstone after removal or account deletion. App-user tables use composite identity/app foreign keys. Passkey private keys and raw ceremony responses are never stored.

### `apps` (M03)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | TEXT | Display name |
| `slug` | TEXT | Unique URL-safe id (from name; suffix on conflict) |
| `client_type` | TEXT | `public` (SPA/PKCE) or `confidential` (server); immutable after create |
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
| `client_secret_hash` | TEXT | Argon2id; NULL for public clients; plaintext shown once on create/rotate |
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

Console members only — see `app_password_reset_tokens` for app users.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID → `users` | |
| `token_hash` | TEXT | Reset `jti` (matches signed token payload; signature verified with instance Ed25519 public key) |
| `expires_at` | TIMESTAMPTZ | 1 hour TTL |
| `used_at` | TIMESTAMPTZ | Single-use |

### `app_password_reset_tokens` (P3M5)

| Column | Type | Notes |
|--------|------|-------|
| `app_user_id` | UUID → `app_users` | |
| `app_id` | UUID → `apps` | Must match `app_users.app_id` |
| `token_hash` | TEXT | Reset `jti` |
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
| `disabled_at` | TIMESTAMPTZ | Operator suspension; blocks sign-in and token use |
| `locked_until` | TIMESTAMPTZ | Temporary password-failure lock |
| `failed_sign_in_count`, `failed_sign_in_window_started_at` | INTEGER, TIMESTAMPTZ | Bounded account-lock state |
| `deleted_at` | TIMESTAMPTZ | Recoverable deleted state; email remains reserved |
| `disabled_by_user_id`, `deleted_by_user_id` | UUID → `users` | Console actor, nullable |
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

### `app_email_verification_tokens`

Stores SHA-256 hashes of single-use, 24-hour app-user verification tokens. Each row is constrained to the matching `(app_user_id, app_id)` realm. Issuing a new token invalidates the previous active token. Raw tokens appear only in the email link.

Account status and email verification are independent. Self-registration starts unverified; operator creation, accepted invitations, and trusted verified federation can mark the email verified. Alpha sign-in and token issuance remain available while unverified, but OIDC/userinfo return `email_verified: false` and service-group sign-in reuse remains blocked.

### `app_browser_sessions` and `app_user_sessions`

`app_browser_sessions` stores the hashed `z0_app_session` browser credential, its 14-day lifetime, revocation state, and device metadata. One browser session may hold isolated grants for several unrelated apps.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `app_user_id` | UUID → `app_users` | CASCADE delete |
| `app_id` | UUID → `apps` | Denormalized for enforcement; must match `app_users.app_id` |
| `browser_session_id` | UUID → `app_browser_sessions` | Browser broker containing this app grant |
| `token_hash` | TEXT nullable | Legacy migrated token reference; new grants store the hash on the browser session |
| `expires_at` | TIMESTAMPTZ | 14-day absolute lifetime (same as console) |
| `created_at`, `last_seen_at` | TIMESTAMPTZ | |
| `revoked_at` | TIMESTAMPTZ | Logout / security revoke |
| `ip_hash`, `user_agent_hash`, `client_label`, `ip_display` | TEXT | Same display pattern as `sessions` |

Cookie `z0_app_session` (HttpOnly, SameSite=Lax). OAuth resolves the grant for the requested app; logging into another app adds or replaces only that app's grant. A browser may also hold the independent console cookie.

### OAuth storage (P4M1 foundation)

OAuth token material is never stored in plaintext. Persist only hashed references (same model as session tokens).

### `oauth_authorization_codes` (P4M1)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Internal row id |
| `code_hash` | TEXT | Unique hash of one-time authorization code |
| `app_id` | UUID → `apps` | App context from resolved `client_id` |
| `app_user_id` | UUID → `app_users` | Subject for code exchange |
| `app_credential_id` | UUID → `app_credentials` | Issuing client credential |
| `redirect_uri` | TEXT | Exact URI validated at authorize + token exchange |
| `scope` | TEXT | Granted scope string (space-delimited) |
| `code_challenge` | TEXT | PKCE challenge as sent by client |
| `code_challenge_method` | TEXT | `S256` for public clients |
| `oidc_nonce` | TEXT | Optional nonce copied unchanged into the ID token |
| `expires_at` | TIMESTAMPTZ | Short TTL (target 10 minutes) |
| `used_at` | TIMESTAMPTZ | First successful token exchange marks one-time use |
| `created_at` | TIMESTAMPTZ | |

Indexes/constraints:
- Unique `code_hash`
- Lookup index on (`app_credential_id`, `expires_at`)
- Lookup index on (`app_user_id`, `created_at`)

### `oauth_access_tokens` (P4M1)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Internal row id |
| `token_hash` | TEXT | Unique hash of opaque access token |
| `app_id` | UUID → `apps` | Token audience app |
| `app_user_id` | UUID → `app_users` | Subject (`sub`); **nullable** for machine tokens (P4M5) |
| `app_credential_id` | UUID → `app_credentials` | Client that obtained token |
| `scope` | TEXT | Granted scope string |
| `expires_at` | TIMESTAMPTZ | Access token expiry |
| `revoked_at` | TIMESTAMPTZ | Revocation timestamp (nullable) |
| `created_at` | TIMESTAMPTZ | |
| `last_used_at` | TIMESTAMPTZ | Optional observability field |

Indexes/constraints:
- Unique `token_hash`
- Lookup index on (`app_user_id`, `revoked_at`, `expires_at`)
- Lookup index on (`app_credential_id`, `revoked_at`)

### `oauth_refresh_tokens` (schema hooks in P4M1, policy in P4M4)

Refresh rotation and family-reuse policy are implemented in P4M4. P4M1 may store minimal refresh metadata only if needed by integration tests.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Internal row id |
| `token_hash` | TEXT | Unique hash of refresh token |
| `app_id` | UUID → `apps` | |
| `app_user_id` | UUID → `app_users` | |
| `app_credential_id` | UUID → `app_credentials` | |
| `scope` | TEXT | |
| `family_id` | UUID | Rotation family identifier |
| `replaced_by_token_id` | UUID → `oauth_refresh_tokens` | For rotation chains |
| `revoked_at` | TIMESTAMPTZ | |
| `expires_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

Indexes/constraints:
- Unique `token_hash`
- Index on `family_id`
- Index on (`app_user_id`, `revoked_at`, `expires_at`)

### `oidc_signing_keys` (P4M2)

OIDC ID tokens are signed with an instance-managed keyset. Private key material is encrypted at rest and never returned by API responses.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Internal row id |
| `kid` | TEXT | Public key identifier exposed in JWKS; unique |
| `algorithm` | TEXT | Signing algorithm (`RS256` in P4M2) |
| `public_jwk` | JSONB | Public JWK document returned by `/.well-known/jwks.json` |
| `private_key_ciphertext` | TEXT | Encrypted private key material for signing |
| `status` | TEXT | `active`, `retired`, `revoked` |
| `activated_at` | TIMESTAMPTZ | Key activation time (nullable until active) |
| `retired_at` | TIMESTAMPTZ | Set when key is no longer used for new tokens |
| `revoked_at` | TIMESTAMPTZ | Emergency revocation marker |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

Indexes/constraints:
- Unique `kid`
- One active signing key at a time (partial unique index on `status = 'active'`)
- Index on (`status`, `activated_at`)

P4M2 starts with one active key and rotation-ready schema. Rotation policy and automation are expanded in a later security module.

### `oauth_user_consents` (P4M3)

Stores prior scope approval per app user and app. Used to skip the consent screen when stored scopes are a superset of the requested scopes.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Internal row id |
| `app_user_id` | UUID → `app_users` | Who approved |
| `app_id` | UUID → `apps` | Which app |
| `scope` | TEXT | Space-delimited granted scopes (union of all approvals) |
| `granted_at` | TIMESTAMPTZ | First approval time |
| `updated_at` | TIMESTAMPTZ | Updated when user approves expanded scopes |

Indexes/constraints:
- Unique (`app_user_id`, `app_id`)
- Index on `app_id`

Skip policy: on `GET /oauth/authorize`, if stored `scope` is a superset of the requested scope, issue the authorization code without showing consent. On approve, upsert with the union of stored + requested scopes.

### Grouped services (P6)

| Table | Purpose |
|-------|---------|
| `service_groups` | Named app group; `sso_enabled` toggles shared sign-in |
| `service_group_apps` | Apps in a group (one group per app) |
| `service_group_members` | Logical person within a group (canonical email) |
| `service_group_app_users` | Links each `app_users` row to a group member |

Console API: `GET/POST /api/v1/service-groups`, `GET/PATCH/DELETE …/:groupId`, `PUT …/:groupId/apps`. Scope: `settings.service_groups:*`.

### Audit events (P7M1)

Append-only security log. `actor_user_id` references console `users` when the actor is an operator; app-user and system events use `payload` (e.g. `appUserId`, `appId`) without a FK.

Representative `action` values: `auth.login_succeeded`, `auth.app_login_succeeded`, `auth.app_register_succeeded`, `auth.app_federation_login_succeeded`, `app.created`, `app.updated`, `credential.*`, `scope.*`, `member.*`, `invite.*`, `role.*`, `smtp.*`, `federation.*`, `service_group.*`, `session.*`, `mfa.*`, `passkey.*`, `app_user_session.revoked`, `app_user.*`, and `console_member.*`. Lifecycle events distinguish lock, unlock, disable, enable, reset request/completion, recoverable deletion, restore, verification, and permanent deletion. MFA and passkey events distinguish enrollment, enable/disable/reset, challenge results, recovery-code use/regeneration, remembered-browser changes/reuse, registration, authentication, management, counter anomalies, step-up, and local owner recovery without storing secret material.

Console API: `GET /api/v1/audit-events` with optional `limit`, `before`, `action`, `resourceType`. Scope: `settings.audit:read`.

### App user sessions (P7M2)

`app_user_sessions` stores device label and masked IP (`client_label`, `ip_display`) like console `sessions`.

Console admin API: `GET/DELETE /api/v1/apps/:appId/users/:userId/sessions/:sessionId`. Hosted self-service: `/auth/sessions?client_id=…` when signed in with `z0_app_session`.

### External OAuth providers (P5)

| Table | Purpose |
|-------|---------|
| `identity_providers` | Instance-level Google, Apple, GitHub, Facebook, or custom OAuth/OIDC config; secrets encrypted |
| `app_identity_providers` | Per-app enablement, sort order, optional extra scopes |
| `app_user_identities` | Links `app_users` to upstream provider subject |
| `app_user_provider_tokens` | Encrypted upstream access/refresh tokens |

`identity_providers.provider_metadata` stores non-secret config (e.g. Apple Team ID and Key ID). Apple private keys are stored in `client_secret_ciphertext`.

**Account linking:** returning provider subject signs in to the linked account; verified upstream email auto-links to an existing `app_users` row; conflicts return `federation_email_conflict`.

**Token API:** `GET /api/v1/apps/:appId/users/:userId/federation/:providerId/token` (auto-refreshes when possible). `POST …/token/refresh` forces upstream refresh. Console (`apps.federation:*`) or OAuth bearer with `federation:token` scope.

Hosted routes: `/auth/federation/:providerKey/start` and `…/callback`. After success, resumes OAuth at `/oauth/resume`.

### `app_memberships` (0015 — superseded)

Bridged global `users` to apps. **Do not build on this.** Removed in migration `0016` when Option B ships.

### Later modules

| Table | Purpose |
|-------|---------|
| `oauth_authorization_codes`, `oauth_access_tokens`, `oauth_refresh_tokens` | OAuth code and token lifecycle |
| `platform_resources`, `platform_scopes` | RBAC catalog (seeded) |
| `instance_roles`, `instance_role_scopes` | Predefined + custom roles |
| `instance_member_roles`, `instance_invite_roles` | Role assignments |
| `audit_events` | Instance audit trail |

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
| Passkeys | `/api/auth/passkeys` management plus registration and authentication option/verification endpoints |
| App user hosted auth (M06) | `/auth/login`, `/auth/register` with `client_id`; `/auth/app-invite/:token` |
| Federation (P5) | `GET/POST/PATCH/DELETE /api/v1/federation/providers`, app federation under `…/apps/:appId/federation`, upstream tokens under `…/users/:userId/federation/:providerId/token` |
| Console session | `z0_session` — `isInstanceMember`, `organizationName` |
| App user session | `z0_app_session` — scoped to one `app_id`; no console access |

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [api/security-contract.md](./api/security-contract.md)
