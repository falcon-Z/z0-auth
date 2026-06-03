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

## Planned app-management APIs (next rewrite wave)

| Endpoint | Primary validation focus |
|----------|--------------------------|
| `GET /api/v1/apps` | Session required |
| `POST /api/v1/apps` | Name required, slug uniqueness, redirect URI validation |
| `POST /api/v1/apps/:appId/credentials` | Ownership + credential policy |
| `GET /api/v1/apps/:appId/users` | Ownership + pagination/filter validation |

## Notes

- Multi-tenant rules are removed.
- Internal platform role/scope validation rules are removed.
- OAuth scope validation remains only for app-facing OAuth contracts.
