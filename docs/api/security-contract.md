# Security and auth behavior contract

Normative rules for sessions, CSRF, cookies, and OAuth. All new API and UI work must comply before shipping.

**Related:** `docs/api/references/common.openapi.yaml`, `docs/ARCHITECTURE.md`, `src/api/lib/session.ts`, `src/api/lib/csrf.ts`.

---

## Sessions

Two session cookies — same lifetime and CSRF rules. **App context** (`client_id`) selects app-user vs console sign-in (Auth0/Clerk-style hosted pages).

### Console (`z0_session`)

| Rule | Value / behavior |
|------|------------------|
| Cookie name | `z0_session` |
| Storage | HttpOnly cookie; token stored hashed in `sessions` table (`user_id` → `users`) |
| Issuance | After successful **console** login — no `client_id` / app context on the request. Setup creates the bootstrap account but does **not** sign you in; use `/auth/login` next. |
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

**Sign-in mode on `/auth/*`:** If the request includes a resolvable `client_id` (query or preserved in `z0_oauth_return`), treat as **app user** sign-in: authenticate `app_users`, issue `z0_app_session`, then redirect to the app (via OAuth `return_to`). Otherwise **console** sign-in: `users` + `z0_session`. Same HTML shell and CSRF; social provider buttons only on app sign-in when configured.

**App user session management (P7M2):** Signed-in app users may open `GET /auth/sessions?client_id=…` to list devices and revoke others. Requires valid `z0_app_session` for that app.

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

Until platform setup completes (unless `ALLOW_INCOMPLETE_SETUP=true`):

- Allowed JSON paths: `/api/deploy/status`, `/api/setup/status`, `/api/setup`, `/api/health`, `/api/live`, `/api/ready`
- All other `/api/*` return **503** with top-level `code`: `SetupRequired`
- HTML auth routes redirect to `/auth/setup` (see `docs/api/ui-flows.md`)

---

## Install token (setup only)

When `INSTALL_TOKEN` is set in the environment:

- `POST /api/setup` requires header `X-Install-Token` matching the env value (JSON API)
- The `/auth/setup` HTML form includes an **Install token** field that satisfies the same check
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
- **Production:** Keys may be auto-generated on first start for a single instance. For multiple replicas, set `INSTANCE_DATA_KEY` and the token keypair (or mount a shared keys file) so every pod uses the same material.

Rotating the data key without re-saving SMTP settings breaks existing ciphertext (same as losing the key).

### Encryption at rest inventory (P7M3)

Operator-managed **`INSTANCE_DATA_KEY`** (AES-256-GCM) encrypts reversible secrets before they are stored in PostgreSQL:

| Stored value | Table / column | Protection |
|--------------|----------------|------------|
| SMTP password | `smtp_settings.password_ciphertext` | AES-256-GCM via data key |
| Federation provider client secret | `identity_providers.client_secret_ciphertext` | AES-256-GCM via data key |
| OIDC signing private key | `oidc_signing_keys.private_key_ciphertext` | AES-256-GCM via data key |
| Federated user refresh/access tokens | `app_user_provider_tokens.*_ciphertext` | AES-256-GCM via data key |

One-way hashes (not encrypted — verification only, plaintext never stored):

| Stored value | Table / column | Protection |
|--------------|----------------|------------|
| OAuth client secret | `app_credentials.client_secret_hash` | Password-style hash |
| OAuth / refresh tokens | `oauth_* .token_hash` | SHA-256 hash |
| Session tokens | `sessions.token_hash`, `app_user_sessions.token_hash` | SHA-256 hash |
| Console / app user passwords | `password_credentials`, `app_users.password_hash` | Password hash |

**Production:** set `INSTANCE_DATA_KEY` explicitly on every replica. Without it, dev may auto-generate a file-backed key; production pods with independent keys cannot decrypt each other's SMTP or federation secrets.

**Rotation:** changing `INSTANCE_DATA_KEY` without re-entering encrypted secrets breaks decryption. Document key backup with operator runbooks (P9M3).

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
| OAuth confidential client auth (`/oauth/token`, `/oauth/revoke`) | 10 / IP + `client_id` | 15 minutes | **429** `invalid_client` |

---

## OAuth 2.1 (baseline)

These rules are required for the OAuth authorization server baseline.

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

- Issued on authorization code exchange; 30-day absolute TTL
- Rotation on each `refresh_token` grant — old refresh invalidated, new pair issued
- Reuse of a rotated refresh token revokes the entire token family
- Revoking a refresh token revokes all refresh tokens in the same family

### CORS (browser clients)

- `POST /oauth/token` and `GET /oauth/userinfo` return CORS headers when `Origin` matches an origin derived from the client’s registered `redirect_uris`
- `OPTIONS` preflight uses the same origin allow-list (any active app’s redirect origins on this instance)
- Public clients must send `state` on `/oauth/authorize`

### Client credentials (machine-to-machine)

- Confidential clients only; `grant_type=client_credentials` at `/oauth/token`
- Optional `scope` must be a subset of the app scope registry
- Access tokens have no `app_user_id` — not valid for `/oauth/userinfo`

### Client authentication

- Confidential clients: `client_secret` at token endpoint
- Public clients: PKCE only; no secret in browser

Reserved error codes: `invalid_client`, `unauthorized_client` (see `ErrorCodes` in `src/lib/contracts/errors.ts`).

---

## OIDC (P4M2 baseline)

OIDC builds on OAuth with discovery metadata, JWK distribution, ID tokens, and userinfo.

### Signing and key exposure

- ID tokens are signed with **RS256**.
- JWKS endpoint exposes **public keys only** (no private key material in responses or logs).
- `kid` in ID token header must match a key published in `/.well-known/jwks.json`.
- Exactly one key is `active` for new token signing at a time; retired keys may remain published for verification until decommissioned.

### Discovery

- `/.well-known/openid-configuration` must publish issuer, authorization endpoint, token endpoint, userinfo endpoint, jwks URI, supported scopes, and supported signing algorithms.
- Metadata values must be stable for a running deployment and must reflect actual server behavior.

### ID token

- Returned from `/oauth/token` for OIDC requests (when `openid` scope is granted).
- Minimum claims: `iss`, `sub`, `aud`, `exp`, `iat`.
- Optional claims are scope-gated (`email`, `email_verified`, `name`).
- `sub` is derived from app-user identity and must be stable for the same app user.

### Userinfo

- `/oauth/userinfo` accepts bearer **access token** only (not ID token).
- Access token must be active, unexpired, and not revoked.
- Response claims are filtered to granted scope.

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
