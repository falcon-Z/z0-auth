# Validation matrix (single-account pivot)

This matrix replaces tenant/platform-RBAC driven validation rules.

## `POST /api/setup`

| Input | Rule | Code | HTTP | UI |
|-------|------|------|------|-----|
| `name` | Non-empty trimmed string | `required` | 400 | Inline on name field |
| `email` | Required + valid email | `required` / `invalid_email` | 400 | Inline on email |
| `organizationName` | Non-empty trimmed string | `required` | 400 | Inline on organization field |
| `password` | Min 14, max 128, character mix, not weak | `password_policy` | 400 | Checklist + inline |
| `passwordConfirm` | Equals `password` | `password_mismatch` | 400 | Inline on confirm |
| CSRF | `X-CSRF-Token` matches cookie and origin check passes | `csrf_invalid` | 403 | Refresh token and retry |
| Install token | Required and valid when configured | `install_token_required` / `install_token_invalid` | 403 | Install token field on `/auth/setup`; `X-Install-Token` on JSON API |
| Schema | Migrations applied (`instance_settings` exists) | `database_unavailable` | 503 | Migration instructions on `/auth/setup` and deploy checklist |
| Platform state | Setup already complete | `setup_complete` | 409 | Redirect to login |

## `GET /api/setup/status`

| Field | Rule | UI |
|-------|------|-----|
| `completed` | Reflects `setup_completed_at` | Redirect to login when true |
| `schemaReady` | Core tables exist | Block setup form when false |
| `installTokenRequired` | `INSTALL_TOKEN` env is set | Show install token field on setup form |

## `POST /api/auth/login`

| Input | Rule | Code | HTTP | UI |
|-------|------|------|------|-----|
| `email` | Required + valid format | `required` / `invalid_email` | 400 | Inline |
| `email` + `password` | Must match account credentials | `invalid_credentials` | 401 | Generic error |
| CSRF | Required | `csrf_invalid` | 403 | Refresh token |
| Rate limit | 10 attempts per IP per 15 min | `rate_limited` | 429 | Show retry state |
| Setup guard | Setup incomplete | `SetupRequired` | 503 | Redirect to setup |

## `GET /api/auth/session`

| Input | Rule | Code | HTTP | UI |
|-------|------|------|------|-----|
| Session cookie | Valid session | — | 200 `authenticated: true` | Load console |
| Missing/invalid session | — | — | 200 `authenticated: false` | Redirect to login |
| Setup incomplete | — | `SetupRequired` | 503 | Redirect to setup |
| Authenticated payload | Returns `user`, `isInstanceMember`, `isBootstrap`, `organizationName` | — | 200 | Render dashboard shell |

## `POST /api/auth/logout`

| Input | Rule | Code | HTTP | UI |
|-------|------|------|------|-----|
| CSRF | Valid token required | `csrf_invalid` | 403 | Prompt reload |
| Session | Optional revoke-if-present | — | 200 | Redirect to login |

## `POST /api/auth/change-password`

| Input | Rule | Code | HTTP | UI |
|-------|------|------|------|-----|
| Session | Required | — | 401 | Redirect to login |
| `currentPassword` | Must match stored hash | `invalid_credentials` | 401 | Inline |
| `password` | Password policy rules | `password_policy` | 400 | Checklist + inline |
| `passwordConfirm` | Must equal `password` | `password_mismatch` | 400 | Inline |
| CSRF | Valid token required | `csrf_invalid` | 403 | Refresh token |
| Success | Revoke other sessions | — | 200 | Success state |

## Instance members (`/api/v1/members`)

| Endpoint | Input | Rule | Code | HTTP | UI |
|----------|-------|------|------|------|-----|
| All | Session | Caller is instance member | `permission_denied` | 403 | Redirect or access denied |
| `GET /api/v1/members` | — | — | — | 200 | Members tab list |
| `DELETE /api/v1/members/:userId` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `DELETE /api/v1/members/:userId` | `userId` | Member exists | `user_not_found` | 404 | Not found state |
| `DELETE /api/v1/members/:userId` | — | Not last active member | `permission_denied` | 409 | Inline error on remove |
| `DELETE /api/v1/members/:userId` | — | Not the instance owner (`is_bootstrap`) | `permission_denied` | 409 | Inline error on remove |
| `GET /api/v1/members/invites` | Session | Instance member | — | 200 | Invites tab |
| `POST /api/v1/members/invites` | `email` | Valid email | `required` / `invalid_email` | 400 | Inline on email |
| `POST /api/v1/members/invites` | `invitedName` | Non-empty trimmed | `required` | 400 | Inline on name |
| `POST /api/v1/members/invites` | `email` | Not already a member | `invite_already_member` | 409 | Inline on email |
| `POST /api/v1/members/invites` | `email` | No other pending invite | `invite_invalid` | 409 | Inline on email |
| `DELETE /api/v1/members/invites/:id` | CSRF + session | Pending invite exists | `invite_invalid` | 404 | Toast / refresh list |

## Public invites (`/api/v1/invites/:token`)

| Endpoint | Input | Rule | Code | HTTP | UI |
|----------|-------|------|------|------|-----|
| `GET …/invites/:token` | `token` | Known invite | `invite_invalid` | 404 | Invalid invite page |
| `GET …/invites/:token` | — | `status` reflects pending/accepted/declined/revoked/expired | — | 200 | Branch UI by status |
| `POST …/accept` | CSRF | Required | `csrf_invalid` | 403 | Refresh token |
| `POST …/accept` | `token` | Pending and not expired | `invite_invalid` | 409 | Expired / used state |
| `POST …/accept` | New user | `name`, `password`, `passwordConfirm` policy | `password_policy` / `password_mismatch` | 400 | Checklist + inline |
| `POST …/accept` | Existing user | Session required | — | 401 | Redirect to login |
| `POST …/accept` | Existing user | Session email matches invite | `invite_email_mismatch` | 409 | Wrong account message |
| `POST …/decline` | CSRF | Valid pending invite | `invite_invalid` | 404 | Invalid state |

## Applications (`/api/v1/apps`)

| Endpoint | Input | Rule | Code | HTTP | UI |
|----------|-------|------|------|------|-----|
| All | Session | Caller is instance member | `permission_denied` | 403 | Access denied |
| `GET /api/v1/apps` | — | — | — | 200 | Applications list |
| `POST /api/v1/apps` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `POST /api/v1/apps` | `name` | Non-empty trimmed | `required` | 400 | Inline on name |
| `POST /api/v1/apps` | `redirectUris` | ≥1 valid http(s) URI; production requires https (except localhost) | `required` / `invalid_redirect_uri` | 400 | Inline on URIs |
| `POST /api/v1/apps` | `clientType` | `public` or `confidential` | `required` | 400 | Inline on type |
| `POST /api/v1/apps` | — | Creates app + default credential | — | 201 | Returns `app`, `credential`, `clientSecret` (null for public) |
| `GET /api/v1/apps/:appId` | `appId` | App exists | `app_not_found` | 404 | Not found state |
| `PATCH /api/v1/apps/:appId` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `PATCH /api/v1/apps/:appId` | `name` / `redirectUris` / `status` | Same rules as create when provided | see above | 400 | Inline |
| `PATCH /api/v1/apps/:appId` | `appId` | App exists | `app_not_found` | 404 | Not found |
| `GET …/credentials` | `appId` | App exists | `app_not_found` | 404 | Not found |
| `POST …/credentials` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `POST …/credentials` | `appId` | App active | `app_disabled` | 409 | Inline / banner |
| `POST …/credentials` | — | Public app allows one active credential | `credential_limit_reached` | 409 | Banner |
| `POST …/credentials` | — | Returns `clientSecret` once (null for public) | — | 201 | One-time copy dialog |
| `DELETE …/credentials/:credentialId` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `DELETE …/credentials/:credentialId` | — | Not last active cred on active app | `last_active_credential` | 409 | Confirm + error |
| `DELETE …/credentials/:credentialId` | — | Credential exists | `credential_not_found` | 404 | Refresh list |
| `POST …/credentials/:credentialId/rotate` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `POST …/rotate` | `appId` | App active | `app_disabled` | 409 | Banner |
| `POST …/rotate` | — | Public client has no secret | `public_client_no_secret` | 409 | Hidden rotate UI |
| `POST …/rotate` | — | Active credential | `credential_not_found` | 404 | Refresh list |
| `POST …/rotate` | — | New `clientSecret` once | — | 200 | One-time copy dialog |

## Email settings (`/api/v1/settings/email`)

| Endpoint | Input | Rule | Code | HTTP | UI |
|----------|-------|------|------|------|-----|
| All | Session | Instance member | `permission_denied` | 403 | Access denied |
| `GET …/email` | — | Password never in response | — | 200 | Email settings form |
| `PUT …/email` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `PUT …/email` | `host`, `port`, `encryption`, `fromAddress` | Valid values | `required` / `invalid_email` | 400 | Inline |
| `PUT …/email` | `encryption` | `none` disallowed in production | `required` | 400 | Inline |
| `PUT …/email` | `password` | Required when enabling with no stored password | `required` | 400 | Inline |
| `POST …/email/test` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `POST …/email/test` | `to` | Valid email | `invalid_email` | 400 | Inline on test field |
| `POST …/email/test` | — | SMTP enabled and configured | `smtp_not_configured` | 409 | Banner |
| `POST …/email/test` | — | Delivery succeeds | `smtp_delivery_failed` | 502 | Banner |

## Application scopes (`/api/v1/apps/:appId/scopes`)

| Endpoint | Input | Rule | Code | HTTP | UI |
|----------|-------|------|------|------|-----|
| All | Session | Instance member | `permission_denied` | 403 | Access denied |
| All | `appId` | App exists | `app_not_found` | 404 | Not found |
| `GET …/scopes` | — | — | — | 200 | Scopes list |
| `POST …/scopes` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `POST …/scopes` | `name` | Non-empty; lowercase; `^[a-z][a-z0-9._:/-]{0,63}$` | `required` / `invalid_scope` | 400 | Inline on name |
| `POST …/scopes` | `name` | Unique per app | `scope_taken` | 409 | Inline on name |
| `POST …/scopes` | `description` | Optional; max 256 chars | `required` | 400 | Inline on description |
| `PATCH …/scopes/:scopeId` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `PATCH …/scopes/:scopeId` | `scopeId` | Scope exists for app | `scope_not_found` | 404 | Refresh list |
| `PATCH …/scopes/:scopeId` | `name` | Same rules as create when provided | see above | 400/409 | Inline |
| `PATCH …/scopes/:scopeId` | `description` | Nullable clears note; max 256 when set | `required` | 400 | Inline |
| `DELETE …/scopes/:scopeId` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `DELETE …/scopes/:scopeId` | `scopeId` | Scope exists | `scope_not_found` | 404 | Refresh list |

## App users (`/api/v1/apps/:appId/users`)

> **Option B:** End-user `userId` = `app_users.id`. Email unique per `appId` only; same email on another app is allowed (separate account).

| Endpoint | Input | Rule | Code | HTTP | UI |
|----------|-------|------|------|------|-----|
| All | Session | Instance member | `permission_denied` | 403 | Access denied |
| All | `appId` | App exists | `app_not_found` | 404 | Not found |
| `GET …/users` | `q` | Optional search on email/name | — | 200 | Search + table |
| `POST …/users` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `POST …/users` | `email`, `name` | Valid email + non-empty name | `required` / `invalid_email` | 400 | Inline |
| `POST …/users` | `password` | Required; policy + confirm | `password_policy` / `password_mismatch` | 400 | Checklist |
| `POST …/users` | `email` | Not already on this app | `app_user_exists` | 409 | Inline on email |
| `POST …/users` | `metadata` | Optional JSON object ≤ 4 KB | `invalid_metadata` | 400 | Inline |
| `GET …/users/:userId` | — | App user exists for app | `app_user_not_found` | 404 | Not found |
| `PATCH …/users/:userId` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `PATCH …/users/:userId` | `membershipStatus` | `active` or `disabled` | `required` | 400 | Inline |
| `GET …/users/invites` | — | Pending non-expired | — | 200 | Invites list |
| `POST …/users/invites` | `email`, `invitedName` | Valid + not already on app | `app_user_exists` / `invite_invalid` | 409 | Inline |
| `DELETE …/invites/:id` | CSRF | Pending invite for app | `invite_invalid` | 404 | Refresh list |

## App user invites (`/api/v1/app-invites/:token`)

| Endpoint | Input | Rule | Code | HTTP | UI |
|----------|-------|------|------|------|-----|
| `GET …/:token` | `token` | Known invite | `invite_invalid` | 404 | Invalid invite (M06 HTML) |
| `POST …/accept` | CSRF | Required | `csrf_invalid` | 403 | Refresh token |
| `POST …/accept` | — | `name`, password policy; creates `app_users` row | `password_policy` / `app_user_exists` | 400 / 409 | Checklist |
| `POST …/decline` | CSRF | Valid pending invite | `invite_invalid` | 404 | Invalid state |

## App hosted auth (`/auth/login`, `/auth/register`, `/auth/app-invite/:token`)

> **Realm:** `client_id` (query, form, or `z0_oauth_return`) → app sign-in (`app_users`, `z0_app_session`). No `client_id` → console sign-in (`users`, `z0_session`).

| Page / action | Input | Rule | Code | HTTP | UI |
|---------------|-------|------|------|------|-----|
| `GET /auth/login` | `client_id` | Resolves to active credential + active app | — | 200 / error page | App name in lead |
| `GET /auth/login` | `client_id` | Unknown or disabled app | — | 200 error card | Sign-in unavailable |
| `POST /auth/login` | App realm | Authenticates `app_users` for resolved `app_id` | `invalid_credentials` | 401 | Generic form error |
| `POST /auth/login` | App realm | Disabled app user | `invalid_credentials` | 401 | Generic form error |
| `POST /auth/login` | App realm | Success issues `z0_app_session` | — | 303 / HX-Redirect | Resume OAuth or `return_to` |
| `GET /auth/register` | No `client_id` | Console invite-only message | — | 200 | Invitation only |
| `GET /auth/register` | `client_id` | Self-registration form | — | 200 | Create account |
| `POST /auth/register` | `client_id` | Email unique per app | `app_user_exists` | 409 | Inline on email |
| `POST /auth/register` | Password | Policy + confirm | `password_policy` / `password_mismatch` | 400 | Checklist |
| `POST /auth/register` | Success | Creates `app_users` + `z0_app_session` | — | 303 | OAuth resume |
| `GET /oauth/authorize` | — | No app session → login with `client_id` | — | 302 | Hosted login |
| `GET /oauth/authorize` | — | App session for same app → code redirect | — | 302 | Back to app |
| Cross-app | Same email | Separate `app_users` rows; A password fails on B `client_id` | `invalid_credentials` | 401 | — |

## Password reset (`/api/auth/forgot-password`, `/api/auth/reset-password`)

| Endpoint | Input | Rule | Code | HTTP | UI |
|----------|-------|------|------|------|-----|
| Both | SMTP | Enabled and configured | `password_reset_unavailable` | 503 | Forgot page info / API |
| `POST forgot` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh |
| `POST forgot` | `email` | Valid format | `required` / `invalid_email` | 400 | Inline |
| `POST forgot` | Rate limit | Per IP / per email | `rate_limited` | 429 | Retry message |
| `POST forgot` | — | Always generic success when format valid | — | 200 | Check your email |
| `POST reset` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh |
| `POST reset` | `token` | Pending, not expired | `reset_token_invalid` | 400 | Invalid link |
| `POST reset` | `password` | Policy + confirm match | `password_policy` / `password_mismatch` | 400 | Checklist + inline |
| `POST reset` | Success | Revokes all sessions for user | — | 200 | Redirect to login |

## Notes

- Multi-tenant rules are removed.
- Internal platform role/scope validation rules are removed.
- OAuth scope validation remains only for app-facing OAuth contracts.
