# Security and auth behavior contract

Normative rules for sessions, CSRF, cookies, and OAuth. All new API and UI work must comply before shipping.

**Related:** `docs/api/references/common.openapi.yaml`, `docs/ARCHITECTURE.md`, `src/api/lib/session.ts`, `src/api/lib/csrf.ts`.

---

## Sessions

Two session cookies — same lifetime and CSRF rules, different identity realms (Auth0/Clerk-style hosted auth).

### Console (`z0_session`)

| Rule | Value / behavior |
|------|------------------|
| Cookie name | `z0_session` |
| Storage | HttpOnly cookie; token stored hashed in `sessions` table (`user_id` → `users`) |
| Issuance | After successful **console** login or setup — no `client_id` / app context on the request |
| Absolute lifetime | **14 days** from creation (`expires_at` in DB and cookie `Max-Age`) |
| Idle timeout | **Not enforced yet** — `last_seen_at` is updated on each valid request; future: configurable idle window (document target: 30 minutes idle, 14 days absolute) |
| Revocation | Logout sets `revoked_at`; invalid/expired tokens return unauthenticated session |
| Production cookie | `Secure` flag when `NODE_ENV=production` |
| SameSite | `Lax` |

### App user (`z0_app_session`)

| Rule | Value / behavior |
|------|------------------|
| Cookie name | `z0_app_session` |
| Storage | HttpOnly cookie; token stored hashed in `app_user_sessions` (`app_user_id` → `app_users`, `app_id` enforced) |
| Issuance | After successful **app** login, self-registration, or invite accept — request must carry app context (`client_id` on authorize/login/register, or invite token → `app_id`) |
| Absolute lifetime | **14 days** (same as console) |
| Revocation | App logout sets `revoked_at` on the app session only; does not clear `z0_session` |
| OAuth | `/oauth/authorize` and `/oauth/resume` use **app** session when returning from hosted auth |
| Cross-app | Session valid for **one `app_id` only**; new login for another app replaces the app session cookie |

**Realm routing on `/auth/*`:** If the request includes a resolvable `client_id` (query or preserved in `z0_oauth_return`), authenticate against `app_users` and issue `z0_app_session`. Otherwise authenticate against `users` and issue `z0_session`. Same HTML forms and CSRF; different handler branch.

**Future APIs** that accept bearer tokens must document their own lifetime and revocation; browser console continues to use `z0_session` unless stated otherwise.

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

- Allowed JSON paths: `/api/deploy/status`, `/api/setup/status`, `/api/setup`, `/api/health`, `/api/live`, `/api/ready`
- All other `/api/*` return **503** with top-level `code`: `SetupRequired`
- HTML auth routes redirect to `/auth/setup` (see `docs/api/ui-flows.md`)

---

## Install token (setup only)

When `INSTALL_TOKEN` is set in the environment:

- `POST /api/setup` requires header `X-Install-Token` matching the env value
- Missing → **403** `install_token_required` on field `_install`
- Wrong → **403** `install_token_invalid` on field `_install`

---

## Instance keys (startup)

Two separate purposes — do not conflate them:

| Key | Algorithm | Use | Must be stable across… |
|-----|-----------|-----|------------------------|
| **Data key** | AES-256-GCM (symmetric) | Encrypt SMTP password and other instance secrets in the DB | **Restarts and all pods** |
| **Token keypair** | Ed25519 (asymmetric) | Sign / verify password-reset links | **All pods** (any pod may verify a link another pod signed) |

### Restarts (single instance)

Keys are **not** regenerated on every restart.

- **Development:** If `INSTANCE_DATA_KEY` is unset, the first start may create `.data/instance-keys.json` (including a data key). Keep that file (or set `INSTANCE_DATA_KEY`) so SMTP settings remain decryptable.
- **Production:** Auto-generating keys in production is not allowed. Set `INSTANCE_DATA_KEY` and the token keypair (or a shared keys file) before using SMTP encryption or password-reset links. The console setup checklist reports missing keys until they are configured.

Rotating the data key without re-saving SMTP settings breaks existing ciphertext (same as losing the key).

### Kubernetes (multiple pods)

Each pod must use the **same** data key and the **same** token keypair.

**Recommended:** one Kubernetes Secret mounted into every replica:

```yaml
env:
  - name: INSTANCE_DATA_KEY
    valueFrom:
      secretKeyRef:
        name: z0-auth-instance-keys
        key: data_key
  - name: INSTANCE_TOKEN_PRIVATE_KEY
    valueFrom:
      secretKeyRef:
        name: z0-auth-instance-keys
        key: token_private_key
  - name: INSTANCE_TOKEN_PUBLIC_KEY
    valueFrom:
      secretKeyRef:
        name: z0-auth-instance-keys
        key: token_public_key
```

Generate the data key once: `bun src/scripts/generate-instance-data-key.ts`.

**Alternative:** mount a **ReadWriteMany** volume at the same `INSTANCE_KEYS_PATH` on all pods (single shared keys file). Simpler for token keys; data key via env is still preferred so pods stay stateless.

**Do not** run multiple pods with independent `.data/` volumes — each would generate different keys and SMTP decryption / reset links would fail unpredictably.

### Reset tokens

Signed payload (`uid`, `exp`, `jti`); `password_reset_tokens.token_hash` stores `jti` for one-time use. Old links stop working when token keys rotate; SMTP secrets require data key stability or re-configuration.

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
| `z0_session` | yes | Lax | Console operator session |
| `z0_app_session` | yes | Lax | App end-user session (one app) |
| `z0_csrf` | no | Lax | CSRF double-submit |
| `z0_oauth_return` | yes | Lax | Resume OAuth after login (10 min) |

---

## Checklist for new auth-sensitive features

1. State-changing? → CSRF + origin validation
2. Uses session? → Respect setup guard and session resolution
3. OAuth-related? → Redirect URI, scope subset, PKCE per above
4. Errors? → `problem()` / `createProblemDetail` + `ErrorCodes`; update OpenAPI + validation matrix
5. Abuse? → Rate limit or document why exempt
