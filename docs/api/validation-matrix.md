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
