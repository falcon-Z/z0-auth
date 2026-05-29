# Security and auth behavior contract

Normative rules for sessions, CSRF, cookies, and OAuth. All new API and UI work must comply before shipping.

**Related:** `docs/api/references/common.openapi.yaml`, `docs/ARCHITECTURE.md`, `src/api/lib/session.ts`, `src/api/lib/csrf.ts`.

---

## Sessions

| Rule | Value / behavior |
|------|------------------|
| Cookie name | `z0_session` |
| Storage | HttpOnly cookie; token stored hashed in `sessions` table |
| Issuance | After successful login; previous session cookie revoked on new login |
| Absolute lifetime | **14 days** from creation (`expires_at` in DB and cookie `Max-Age`) |
| Idle timeout | **Not enforced yet** — `last_seen_at` is updated on each valid request; future: configurable idle window (document target: 30 minutes idle, 14 days absolute) |
| Revocation | Logout sets `revoked_at`; invalid/expired tokens return unauthenticated session |
| Production cookie | `Secure` flag when `NODE_ENV=production` |
| SameSite | `Lax` |

**Future APIs** that accept bearer tokens must document their own lifetime and revocation; browser console continues to use the session cookie unless stated otherwise.

---

## CSRF

| Surface | Token delivery | Validation |
|---------|----------------|--------------|
| JSON API (`POST`/`PUT`/`PATCH`/`DELETE`) | Cookie `z0_csrf` + header `X-CSRF-Token` | Header must match cookie; `Origin` or `Referer` host must match `Host` |
| HTML forms | Cookie `z0_csrf` + field `_csrf` | Field must match cookie; same origin check |
| Safe methods (`GET`, `HEAD`) | CSRF cookie may be issued | No CSRF check |

Error: **403** with `errors[].code` = `csrf_invalid`, field `_csrf`.

**New state-changing endpoints** must call `validateCsrf` (API) or `validateFormCsrf` (HTML) unless explicitly exempted in this document.

---

## Setup guard

Until platform setup completes:

- Allowed JSON paths: `/api/setup/status`, `/api/setup`, `/api/health`, `/api/live`, `/api/ready`
- All other `/api/*` return **503** with top-level `code`: `SetupRequired`
- HTML auth routes redirect to `/auth/setup` (see `docs/api/ui-flows.md`)

---

## Install token (setup only)

When `INSTALL_TOKEN` is set in the environment:

- `POST /api/setup` requires header `X-Install-Token` matching the env value
- Missing → **403** `install_token_required` on field `_install`
- Wrong → **403** `install_token_invalid` on field `_install`

---

## Rate limits (current)

| Action | Limit | Window | Error |
|--------|-------|--------|-------|
| Setup | 3 / IP | 1 hour | **429** `rate_limited`, field `_rate`, optional `retryAfter` |
| Login | 10 / IP | 15 minutes | **429** `rate_limited`, field `_rate` |

---

## OAuth 2.1 (planned — implement before token endpoint ships)

These rules are **required** for Phase 3; the dev stub at `/oauth/authorize` does not enforce them yet.

### Redirect URI

- **Exact string match** against one of the client’s registered `redirect_uris`
- No wildcards, no partial paths, no open redirects
- Comparison is case-sensitive for scheme/host/path; query strings are not part of registration unless explicitly stored
- Error code: `invalid_redirect_uri`

### Scopes

- Requested `scope` (space-delimited) must be a **subset** of scopes registered for the client
- Unknown scope in request → **400** `invalid_scope`
- APIs and consent UI must use the same scope strings as the registry

### PKCE

- **Public clients** (no client secret): `code_challenge` + `code_challenge_method=S256` **required** on authorize
- Confidential clients: PKCE recommended; document per-client policy
- Token endpoint must verify `code_verifier` against stored challenge
- Error code: `pkce_required`

### Authorization code

- One-time use; short TTL (target: 10 minutes)
- Bound to `client_id`, `redirect_uri`, PKCE challenge, and issuing user session

### Refresh tokens

- Rotation on use; reuse detection revokes token family (Phase 3 acceptance)

### Client authentication

- Confidential clients: `client_secret` at token endpoint
- Public clients: PKCE only; no secret in browser

Reserved error codes: `invalid_client`, `unauthorized_client` (see `ErrorCodes` in `src/lib/contracts/errors.ts`).

---

## Cookies summary

| Cookie | HttpOnly | SameSite | Purpose |
|--------|----------|----------|---------|
| `z0_session` | yes | Lax | Session token |
| `z0_csrf` | no | Lax | CSRF double-submit |
| `z0_oauth_return` | yes | Lax | Resume OAuth after login (10 min) |

---

## Checklist for new auth-sensitive features

1. State-changing? → CSRF + origin validation
2. Uses session? → Respect setup guard and session resolution
3. OAuth-related? → Redirect URI, scope subset, PKCE per above
4. Errors? → `problem()` / `createProblemDetail` + `ErrorCodes`; update OpenAPI + validation matrix
5. Abuse? → Rate limit or document why exempt
