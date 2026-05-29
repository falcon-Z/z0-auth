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
