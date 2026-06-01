# Validation matrix (API + UI)

Maps inputs to validation rules, error codes, HTTP status, and UI behavior. **Source of truth for codes:** `src/lib/contracts/errors.ts`. **Runtime:** `src/lib/contracts/validation.ts`, `password-policy.ts`, API services.

When adding an endpoint, add a row here and a test in `tests/integration/`.

---

## Legend

| Column | Meaning |
|--------|---------|
| UI | How the console or `/auth/*` form should react |
| Test | Integration test file covering the case |

---

## `GET /api/setup/status`

| Input | Rule | Code | HTTP | UI | Test |
|-------|------|------|------|-----|------|
| — | Always allowed (pre-setup) | — | 200 | Setup wizard shows when `completed: false` | `ui-contract` |

---

## `POST /api/setup`

| Input | Rule | Code | HTTP | UI | Test |
|-------|------|------|------|-----|------|
| `name` | Non-empty trimmed string | `required` | 400 | Inline on name field | `setup-validation` |
| `email` | Required | `required` | 400 | Inline on email | `setup-validation` |
| `email` | Valid email format | `invalid_email` | 400 | Inline on email | `setup-validation` |
| `organizationName` | Non-empty trimmed string | `required` | 400 | Inline on org field | `setup-validation` |
| `password` | Min 14 characters | `password_policy` | 400 | Checklist item `min_length` | `setup-validation` |
| `password` | Max 128 characters | `password_policy` | 400 | Generic password error | — |
| `password` | Uppercase, lowercase, digit, special | `password_policy` | 400 | Checklist `character_mix` | `setup-validation` |
| `password` | Not blocklisted common password | `password_policy` | 400 | Checklist `not_weak` | `setup-validation` |
| `password` | Must not contain name/email parts (≥3 chars) | `password_policy` | 400 | Checklist `not_contextual` | — |
| `passwordConfirm` | Must equal `password` | `password_mismatch` | 400 | Inline on confirm | `setup-validation` |
| CSRF | `X-CSRF-Token` matches `z0_csrf` cookie | `csrf_invalid` | 403 | Reload form / refresh token | `setup-validation` |
| Origin | `Origin` or `Referer` host matches `Host` | `csrf_invalid` | 403 | — | — |
| Install token | Required when `INSTALL_TOKEN` env set | `install_token_required` | 403 | — | — |
| Install token | Must match env | `install_token_invalid` | 403 | — | — |
| Rate limit | 3 attempts / IP / hour | `rate_limited` | 429 | Show retry message; honor `retryAfter` if present | — |
| Platform state | Setup already done | `setup_complete` | 409 | Redirect to login | — |
| `email` | Unique in `users` | — | 409 | Generic conflict message | — |
| Body | Valid JSON object | — | 400 | — | — |

**Success:** 201 + `SetupResponse`; HTML `POST /auth/setup` → 303 to login with query params.

---

## `POST /api/auth/login`

| Input | Rule | Code | HTTP | UI | Test |
|-------|------|------|------|-----|------|
| `email` | Required / valid format | `required` / `invalid_email` | 400 | Inline on email | `auth-validation` |
| `email` + `password` | User exists and password verifies | `invalid_credentials` | 401 | Generic message on form (no field leak) | `auth-validation` |
| CSRF | Header matches cookie + origin | `csrf_invalid` | 403 | Refresh CSRF | — |
| Rate limit | 10 / IP / 15 min | `rate_limited` | 429 | Show lockout message | — |
| Setup | Platform not set up | `SetupRequired` | 503 | Redirect to setup | `pre-setup-guard` |

**Success:** 200 + `authenticated: true` + `Set-Cookie: z0_session`; HTML → 303 to `/`.

---

## `GET /api/auth/session`

| Input | Rule | Code | HTTP | UI | Test |
|-------|------|------|------|-----|------|
| Session cookie | Valid, not revoked, not expired | — | 200 `authenticated: true` | Console loads | `auth-flow` |
| No/invalid session | — | — | 200 `authenticated: false` | Redirect to `/auth/login` | `auth-flow` |
| Setup incomplete | — | `SetupRequired` | 503 | Setup flow | `pre-setup-guard` |
| Authenticated | Includes `organizations`, `tenantRoles`, `canSwitchOrganization` | — | 200 | Show org switcher when `canSwitchOrganization` | `auth-organization` |

---

## `POST /api/auth/active-tenant`

| Input | Rule | Code | HTTP | UI | Test |
|-------|------|------|------|-----|------|
| Session | Required | — | 401 | Redirect to login | `auth-organization` |
| CSRF | Valid | `csrf_invalid` | 403 | Refresh CSRF | — |
| `tenantId` | Non-empty | `required` | 400 | Inline | `auth-organization` |
| `tenantId` | User is member of org | `tenant_access_denied` | 403 | Show error | `auth-organization` |
| Success | — | — | 200 session payload; `tenant` updated | Switcher reflects new org | `auth-organization` |

---

## `POST /api/auth/logout`

| Input | Rule | Code | HTTP | UI | Test |
|-------|------|------|------|-----|------|
| CSRF | Valid | `csrf_invalid` | 403 | — | — |
| Session | Optional; revokes if present | — | 200 `{ ok: true }` | Redirect to login | `auth-flow` |

---

## `POST /api/auth/register`

| Rule | Code | HTTP | UI |
|------|------|------|-----|
| Disabled on platform | — | 403 | N/A |

---

## `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`

| Rule | Code | HTTP | UI |
|------|------|------|-----|
| SMTP not configured | `password_reset_unavailable` | 503 | Informational HTML on `/auth/forgot-password` |

---

## Protected `/api/*` (general)

| Condition | Code | HTTP | UI |
|-----------|------|------|-----|
| Setup incomplete | `SetupRequired` | 503 | Force setup |
| Invalid JSON on POST | — | 400 | Parse error |
| Wrong HTTP method | — | 405 + `allowed` | — |

---

## `GET /api/v1/roles`

| Query | Rule | Code | HTTP | UI |
|-------|------|------|------|-----|
| Session | Required | — | 401 | Login |
| `scope` | `tenant` (default) | — | 200 | Role checkboxes on invite form |

---

## `GET /api/v1/tenants/:tenantId/members`

| Rule | Code | HTTP | UI |
|------|------|------|-----|
| Session | Required | — | 401 | Login |
| Permission | `users:read` for tenant (or `platform:manage`) | `permission_denied` | 403 | Members page empty state |
| Tenant | Valid UUID | — | 404 | — |

---

## `POST /api/v1/tenants/:tenantId/invites`

| Field | Rule | Code | HTTP | UI |
|-------|------|------|------|-----|
| Session + CSRF | Required | `csrf_invalid` | 403 | — |
| Permission | `users:invite` | `permission_denied` | 403 | — |
| `email` | Valid email | `invalid_email` | 400 | Inline |
| `invitedName` | Non-empty | `required` | 400 | Inline |
| `roleKeys` | ≥1 valid tenant role | `invalid_role` / `required` | 400 | Checkboxes |
| Email | Not already member | `invite_already_member` | 409 | Inline |
| Email | No duplicate pending invite | `invite_invalid` | 409 | Inline |

**Success:** 201 + `inviteUrl` (no email sent). Console: copy link + `mailto:`.

---

## `GET /api/v1/invites/:token`

| Rule | Code | HTTP | UI |
|------|------|------|-----|
| Token | Valid pending (or terminal status in body) | `invite_invalid` | 404 | `/auth/invite/:token` message |
| — | Expired pending → `status: expired` in 200 | — | 200 | Expired message |

**Response includes `accountExists` and `viewer.authenticated` / `viewer.emailMatches` for accept/decline UX.**

---

## `POST /api/v1/invites/:token/accept`

| Case | Rule | Code | HTTP | UI |
|------|------|------|------|-----|
| New user | `password` + policy + `name` | `password_policy` etc. | 400 | Accept form |
| Existing user | Session required; email matches invite | `invite_email_mismatch` | 403 | Wrong-account page |
| Existing user | Not already member | `invite_already_member` | 409 | — |
| Token | Pending, not expired | `invite_invalid` / `invite_expired` | 404/409 | — |

**Success:** 200; new users receive session cookie.

---

## `POST /api/v1/invites/:token/decline`

| Case | Rule | Code | HTTP | UI |
|------|------|------|------|-----|
| Existing user | Session + email match | `invite_email_mismatch` | 403 | Sign in first |
| New user (no account) | Token only | — | 200 | Decline without sign-in |
| Token | Pending | `invite_invalid` | 404/409 | — |

---

## `GET /auth/invite/:token` (HTML)

| State | Behavior |
|-------|----------|
| Pending + new user | Password accept form |
| Pending + existing + unsigned | Login with `return_to` invite URL |
| Pending + existing + signed in + email match | Accept / Decline buttons |
| Pending + existing + wrong account | Sign out + retry |
| Not pending | Status message |

---

## `GET /api/v1/users`

| Input | Rule | Code | HTTP | UI | Test |
|-------|------|------|------|-----|------|
| Session | Required | — | 401 | Redirect to login | `users-lifecycle` |
| Permission | `platform:manage` | `permission_denied` | 403 | Users page empty/denied | `users-lifecycle` |
| Success | — | — | 200 `{ users }` | Table of users | `users-lifecycle` |

---

## `GET /api/v1/users/:userId`

| Input | Rule | Code | HTTP | UI | Test |
|-------|------|------|------|-----|------|
| Permission | `platform:manage` | `permission_denied` | 403 | — | `users-lifecycle` |
| `userId` | Known user | `user_not_found` | 404 | — | `users-lifecycle` |
| Success | — | — | 200 user | Detail row | `users-lifecycle` |

---

## `PATCH /api/v1/users/:userId`

| Input | Rule | Code | HTTP | UI | Test |
|-------|------|------|------|-----|------|
| CSRF | Valid | `csrf_invalid` | 403 | Refresh CSRF | — |
| Permission | `platform:manage` | `permission_denied` | 403 | — | `users-lifecycle` |
| `status` | `active` or `disabled` | `required` / validation | 400 | Inline | `users-lifecycle` |
| Target | Not self | `cannot_disable_self` | 403 | Inline error | `users-lifecycle` |
| Target | Not last active platform admin when disabling | `last_platform_admin` | 403 | Inline error | `users-lifecycle` |
| `userId` | Known user | `user_not_found` | 404 | — | `users-lifecycle` |
| Disable | Revokes all target sessions | — | 200 | Row status updates | `users-lifecycle` |
| Success | Audit `user.disabled` / `user.enabled` | — | 200 | — | `users-lifecycle` |

---

## `POST /api/auth/change-password`

| Input | Rule | Code | HTTP | UI | Test |
|-------|------|------|------|-----|------|
| Session | Required | — | 401 | Redirect to login | `users-lifecycle` |
| CSRF | Valid | `csrf_invalid` | 403 | Refresh CSRF | — |
| `currentPassword` | Matches stored hash | `invalid_credentials` | 401 | Inline on current | `users-lifecycle` |
| `password` | Policy rules | `password_policy` | 400 | Checklist / inline | `users-lifecycle` |
| `passwordConfirm` | Equals `password` | `password_mismatch` | 400 | Inline on confirm | `users-lifecycle` |
| Success | Revokes other sessions; audit `user.password_changed` | — | 200 `{ ok: true }` | Success message | `users-lifecycle` |

---

## `GET /api/v1/sessions`

| Input | Rule | Code | HTTP | UI | Test |
|-------|------|------|------|-----|------|
| Session | Required | — | 401 | Redirect to login | `sessions-management` |
| Scope | Current user only (no admin revoke others in v1) | — | 200 | Sessions table | `sessions-management` |
| Success | `{ sessions[] }` with `clientLabel`, `ipDisplay`, `isCurrent` | — | 200 | Device column | `sessions-management` |

---

## `DELETE /api/v1/sessions/:sessionId`

| Input | Rule | Code | HTTP | UI | Test |
|-------|------|------|------|-----|------|
| CSRF | Valid | `csrf_invalid` | 403 | Refresh CSRF | — |
| Session | Required | — | 401 | Redirect to login | `sessions-management` |
| `sessionId` | Active session owned by user | `session_not_found` | 404 | Inline error | `sessions-management` |
| Current session | Revoke + clear cookie | — | 200 `{ revokedCurrent: true }` | Redirect to login | `sessions-management` |
| Other session | Revoke only | — | 200 `{ revokedCurrent: false }` | Row removed | `sessions-management` |
| Success | Audit `session.revoked` / `session.revoked_current` | — | 200 | — | `sessions-management` |

---

## `POST /api/v1/sessions/revoke-others`

| Input | Rule | Code | HTTP | UI | Test |
|-------|------|------|------|-----|------|
| CSRF | Valid | `csrf_invalid` | 403 | Refresh CSRF | — |
| Session | Required | — | 401 | Redirect to login | `sessions-management` |
| Success | Revokes all except current; audit `session.revoked_others` | — | 200 `{ revokedCount }` | Confirm dialog | `sessions-management` |

---

## `GET /api/v1/tenants`

| Input | Rule | Code | HTTP | UI | Test |
|-------|------|------|------|-----|------|
| Session | Required | — | 401 | Redirect to login | `tenants-management` |
| Success | Membership list only (not instance-wide) | — | 200 `{ tenants }` | Organizations table | `tenants-management` |

---

## `POST /api/v1/tenants`

| Input | Rule | Code | HTTP | UI | Test |
|-------|------|------|------|-----|------|
| CSRF | Valid | `csrf_invalid` | 403 | Refresh CSRF | — |
| Session | Required | — | 401 | Redirect to login | `tenants-management` |
| Permission | `tenants:create` (platform only) | `permission_denied` | 403 | Hide create actions | `tenants-management` |
| `name` | Non-empty trimmed string | `required` | 400 | Inline on name | `tenants-management` |
| `slug` | Non-empty; lowercase `a-z`, `0-9`, hyphens; max 64 | `invalid_slug` | 400 | Inline on slug | `tenants-management` |
| `slug` | Unique | `slug_taken` | 409 | Inline on slug | `tenants-management` |
| `joinAsAdmin` | Optional boolean; default false | — | — | Checkbox default off | `tenants-management` |
| Success | Audit `tenant.created`; optional membership + `tenant.member_joined` | — | 201 `{ tenant }` | Success + invite or members link | `tenants-management` |

---

## OAuth (planned — enforce before implementation)

| Input | Rule | Code | HTTP |
|-------|------|------|------|
| `redirect_uri` | Exact match to registered URI | `invalid_redirect_uri` | 400 |
| `scope` | Subset of client scopes | `invalid_scope` | 400 |
| Public client | `code_challenge` + `S256` | `pkce_required` | 400 |
| `client_id` | Known active client | `invalid_client` | 400 |
| Grant / redirect combo | Allowed for client type | `unauthorized_client` | 400 |

See `docs/api/security-contract.md` and `docs/api/references/oauth.openapi.yaml`.

---

## Password policy reference

Constants: `PASSWORD_MIN_LENGTH` = 14, `PASSWORD_MAX_LENGTH` = 128.

Rules evaluated in `validatePassword()` (each failure adds one `password_policy` error with rule label as message):

1. At least 14 characters  
2. At most 128 characters  
3. One uppercase letter  
4. One lowercase letter  
5. One digit  
6. One special character (`SPECIAL_CHAR_RE`)  
7. Not a commonly used password (blocklist)  
8. Does not contain name or email local-part (≥3 characters)

UI checklist uses aggregated rules in `passwordChecklistRules` (see `password-policy.ts`).
