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
| Install token | Required and valid when configured | `install_token_required` / `install_token_invalid` | 403 | Show setup blocked state |
| Platform state | Setup already complete | `setup_complete` | 409 | Redirect to login |

## `POST /api/auth/register`

| Input | Rule | Code | HTTP | UI |
|-------|------|------|------|-----|
| `name` | Non-empty trimmed string | `required` | 400 | Inline |
| `email` | Required + valid + unique | `required` / `invalid_email` | 400/409 | Inline |
| `organizationName` | Non-empty trimmed string | `required` | 400 | Inline |
| `password` | Policy rules | `password_policy` | 400 | Checklist + inline |
| `passwordConfirm` | Must match `password` | `password_mismatch` | 400 | Inline |
| CSRF | Required | `csrf_invalid` | 403 | Refresh token |

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
| Authenticated payload | Returns `user`, `organization`, `accountType`, `managedAppCount` | — | 200 | Render dashboard shell |

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
| `POST /api/v1/apps` | `name` | Slug derivable from name | `invalid_slug` | 400 | Inline on name |
| `GET /api/v1/apps/:appId` | `appId` | App exists | `app_not_found` | 404 | Not found state |
| `PATCH /api/v1/apps/:appId` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `PATCH /api/v1/apps/:appId` | `name` / `redirectUris` / `status` | Same rules as create when provided | see above | 400 | Inline |
| `PATCH /api/v1/apps/:appId` | `appId` | App exists | `app_not_found` | 404 | Not found |
| `GET …/credentials` | `appId` | App exists | `app_not_found` | 404 | Not found |
| `POST …/credentials` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `POST …/credentials` | `appId` | App active | `app_disabled` | 409 | Inline / banner |
| `POST …/credentials` | — | Returns `clientSecret` once | — | 201 | One-time copy dialog |
| `DELETE …/credentials/:credentialId` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `DELETE …/credentials/:credentialId` | — | Not last active cred on active app | `last_active_credential` | 409 | Confirm + error |
| `DELETE …/credentials/:credentialId` | — | Credential exists | `credential_not_found` | 404 | Refresh list |
| `POST …/credentials/:credentialId/rotate` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `POST …/rotate` | `appId` | App active | `app_disabled` | 409 | Banner |
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
