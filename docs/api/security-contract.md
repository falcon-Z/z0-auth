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
| Storage | HttpOnly cookie; token stored hashed in `app_browser_sessions`; per-app grants live in `app_user_sessions` with composite app-user realm enforcement |
| Issuance | After successful **app** login, self-registration, or invite accept — request must carry app context (`client_id` on authorize/login/register, or invite token → `app_id`) |
| Absolute lifetime | **14 days** (same as console) |
| Revocation | Hosted logout revokes the browser broker and its app grants; it never clears the separate `z0_session` console cookie |
| OAuth | `/oauth/authorize` and `/oauth/resume` use **app** session when returning from hosted auth |
| Cross-app | One browser credential may contain isolated grants for several apps. OAuth resolves only the requested app grant; service-group SSO may deliberately provision a sibling grant. |

**Sign-in mode on `/auth/*`:** If the request includes a resolvable `client_id` (query or preserved in `z0_oauth_return`), treat as **app user** sign-in: authenticate `app_users`, issue `z0_app_session`, then redirect to the app (via OAuth `return_to`). Otherwise **console** sign-in: `users` + `z0_session`. Same HTML shell and CSRF; social provider buttons only on app sign-in when configured.

**App user session management (P7M2):** Signed-in app users may open `GET /auth/sessions?client_id=…` to list devices and revoke others. Requires valid `z0_app_session` for that app.

**Future APIs** that accept bearer tokens must document their own lifetime and revocation; browser console continues to use `z0_session` unless stated otherwise.

## Multi-factor authentication

TOTP MFA is available independently to console members and app users. A console factor belongs to one `users.id`; an app-user factor belongs to one app-scoped `app_users.id`. Matching email addresses never share a factor, recovery code, challenge, or remembered browser.

- TOTP follows RFC 6238 with HMAC-SHA-1, six digits, a 30-second period, and a one-step clock-skew window. Seeds are encrypted with the instance data key.
- Enrollment expires after 10 minutes and does not enable MFA until a current code is verified. Ten 128-bit recovery codes are shown once and stored only as SHA-256 hashes.
- After any supported primary method succeeds, an MFA-enabled identity receives a five-minute `z0_mfa_challenge` cookie instead of a full realm session. Password, magic link, federation, invitations, and service-group reuse all use this gate.
- A challenge is single-use, bound to realm, identity, app where relevant, IP/client hashes, and a safe return path. Five failed proofs consume it. A TOTP time step and each recovery code can be accepted only once.
- `Remember this browser` is unchecked by default. Remembered tokens last 30 days, rotate after use, are stored hashed, and are limited to five per identity. App remembered cookies are isolated by app. Reuse of a rotated token revokes every remembered token for that identity/app.
- Remembered browsers bypass the sign-in MFA prompt only. They do not set `mfa_authenticated_at` and cannot satisfy sensitive-action checks.
- For a member with MFA enabled, named sensitive console mutations require `mfa_authenticated_at` in the current session within the last 10 minutes. Permission and CSRF checks still apply and MFA never grants a scope.
- Password reset does not disable MFA. It revokes sessions, pending MFA challenges, and remembered browsers. Account disable/delete and operator MFA reset do the same.
- Operator reset is available for eligible non-owner targets. Owners use the local typed-confirmation command documented in deployment guidance.

MFA enrollment, challenge, recovery, and remembered-browser responses use `Cache-Control: no-store`. Seeds, provisioning URIs, submitted codes, recovery codes, and raw challenge/remembered tokens must never enter logs or audit payloads.

## Passkeys

WebAuthn passkeys are separate for console members and each app-local user. A credential registered to one realm or app is never offered or accepted in another.

- `PUBLIC_ORIGIN` is the exact expected WebAuthn origin. Its lowercase hostname is the relying-party ID. Production requires HTTPS; development also permits `http://localhost` with any port. Request headers and app redirect URIs cannot change either value.
- Registration requires user presence and user verification, requests no attestation, prefers a discoverable credential, and accepts ES256 or RS256. Authentication also requires user verification. A successful assertion is both primary authentication and fresh MFA, so it bypasses a TOTP prompt for that sign-in and satisfies the 10-minute sensitive-action check.
- Public sign-in is email-first. The server returns ten realm/app-scoped credential descriptors padded with deterministic opaque decoys. Responses do not include labels, user handles, transports, owner IDs, or credential counts. Unknown identities receive the same response structure and generic verification failure.
- Registration and assertion challenges are single-use, expire after five minutes, are stored hashed, and are bound to the realm, app where relevant, exact origin and RP ID, and client fingerprints. Five failed verification attempts consume a ceremony.
- Users may keep up to ten passkeys, give each a 1–80 character label, rename it, and remove it. Adding another strong method or removing a passkey requires recent strong authentication. Removing or resetting credentials revokes the identity's active sessions and app tokens.
- Credential IDs are globally tombstoned after removal so they cannot be moved between identities or realms. Public keys, algorithms, counters, and backup flags are stored; private keys never leave the authenticator. A valid assertion with a regressing non-zero counter revokes current authority and records a security event.
- Operator MFA reset removes both TOTP and passkeys for an eligible target. The local sole-owner recovery command does the same. Password, magic-link, federation, TOTP, recovery-code, and second-passkey fallback remain independent recovery choices when configured.

Passkey option and verification responses use `Cache-Control: no-store`. Credential IDs, handles, public keys, signatures, challenges, authenticator data, and raw device metadata must not enter logs or audit payloads.

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

The health and deployment-status routes are public because operators and container tools need them before setup. They return short reason codes and safe instructions only. They must not return database connection strings, raw database errors, SMTP passwords, bootstrap or install tokens, private keys, full setting values, or key-file paths.

---

## Install token (setup only)

When `INSTALL_TOKEN` is set in the environment:

- `POST /api/setup` requires header `X-Install-Token` matching the env value (JSON API)
- The `/auth/setup` HTML form includes an **Install token** field that satisfies the same check
- Missing → **403** `install_token_required` on field `_install`
- Wrong → **403** `install_token_invalid` on field `_install`

---

## Configured first-owner bootstrap

Operators may create the first owner from deployment configuration instead of the browser setup form.

- Supported variables: `Z0_BOOTSTRAP_ORG_NAME`, `Z0_BOOTSTRAP_ADMIN_NAME`, `Z0_BOOTSTRAP_ADMIN_EMAIL`, `Z0_BOOTSTRAP_ADMIN_PASSWORD`
- If any `Z0_BOOTSTRAP_*` variable is set, all four are required before automatic setup runs.
- Automatic setup runs only while platform setup is incomplete.
- The owner is inserted in the same atomic setup transaction as `POST /api/setup`.
- Bootstrap passwords must satisfy the normal setup password policy.
- After setup completes, bootstrap variables are ignored.

---

## Account lifecycle and recovery

- Console identities (`users`) and app-local identities (`app_users`) have separate lifecycle state, credentials, sessions, recovery, and audit records.
- Authentication requires no disable timestamp, no delete timestamp, and no unexpired temporary lock. Public password, magic-link, reset-request, and verification-request responses do not reveal which state caused rejection.
- Ten consecutive password failures within 15 minutes lock that account for 15 minutes. Existing IP-based request limits still apply. A successful password reset, magic link, or trusted external-provider sign-in clears the password lock.
- Disable, lock, and recoverable delete revoke active realm sessions. Disable and delete also invalidate pending authorization codes, access/refresh tokens, reset links, magic links, verification links, and stored upstream tokens where applicable.
- Restore always returns an account as disabled. Enabling never revives old sessions or tokens.
- Permanent deletion is separate, CSRF-protected, and requires the exact normalized email. It cannot target the acting console member, owner, or last active console member. App-user deletion never crosses its `app_id` boundary.
- Administrator reset sends the existing single-use recovery flow. Operators cannot set, retrieve, or view a user's password or raw production reset link.
- Self-registered app users can verify email through a hashed single-use 24-hour token when SMTP is ready. Verification is reflected in OIDC/userinfo but is not an alpha sign-in requirement.

---

## Instance keys (startup)

Two separate purposes — do not conflate them:

| Key | Algorithm | Use | Must be stable across… |
|-----|-----------|-----|------------------------|
| **Data key** | AES-256-GCM (symmetric) | Encrypt SMTP password and other instance secrets in the DB | **Restarts and all pods** |
| **Token keypair** | Ed25519 (asymmetric) | Sign / verify password-reset links | **All pods** (any pod may verify a link another pod signed) |

Each key also has a stable key ID (`kid`). Newly encrypted values and newly signed reset tokens include the `kid` so a future key-ring provider can decrypt or verify with older keys during rotation.

### Restarts (single instance)

Keys are **not** regenerated on every restart.

- **Development:** If `INSTANCE_DATA_KEY` is unset, the first start may create `.data/instance-keys.json` (including a data key). Keep that file (or set `INSTANCE_DATA_KEY`) so SMTP settings remain decryptable.
- **Production:** Root keys are required at startup. z0-auth does not auto-generate production data or token keys. Set `INSTANCE_DATA_KEY_ID`, `INSTANCE_DATA_KEY`, `INSTANCE_TOKEN_KEY_ID`, `INSTANCE_TOKEN_PRIVATE_KEY`, and `INSTANCE_TOKEN_PUBLIC_KEY` in the deployment environment.

Changing a root key without a key-ring rotation workflow can break existing ciphertext or outstanding signed links.

### Encryption at rest inventory (P7M3)

Operator-managed **`INSTANCE_DATA_KEY`** (AES-256-GCM) encrypts reversible secrets before they are stored in PostgreSQL:

| Stored value | Table / column | Protection |
|--------------|----------------|------------|
| SMTP password | `smtp_settings.password_ciphertext` | AES-256-GCM via data key |
| Federation provider client secret | `identity_providers.client_secret_ciphertext` | AES-256-GCM via data key |
| OIDC signing private key | `oidc_signing_keys.private_key_ciphertext` | AES-256-GCM via data key |
| Federated user refresh/access tokens | `app_user_provider_tokens.*_ciphertext` | AES-256-GCM via data key |
| Console/app-user TOTP seeds | `*_totp_factors.secret_ciphertext` | AES-256-GCM via data key |

**Federation token API:** App backends with the `federation:token` scope (via client credentials or user access token) may call `GET/POST …/federation/{providerId}/token` to read or refresh upstream provider tokens. Tokens are never returned to browsers; audit events `federation.token_accessed` and `federation.token_refreshed` are written on use.

One-way hashes (not encrypted — verification only, plaintext never stored):

| Stored value | Table / column | Protection |
|--------------|----------------|------------|
| OAuth client secret | `app_credentials.client_secret_hash` | Password-style hash |
| OAuth / refresh tokens | `oauth_* .token_hash` | SHA-256 hash |
| Session tokens | `sessions.token_hash`, `app_browser_sessions.token_hash` | SHA-256 hash |
| MFA recovery/challenge/remembered tokens | `*_mfa_* .code_hash` / `.token_hash` | SHA-256 hash |
| Console / app user passwords | `password_credentials`, `app_users.password_hash` | Password hash |

Encrypted value format:

```text
z0enc:v1:<base64url-kid>:<base64url-nonce-and-ciphertext>
```

**Production:** set the same `INSTANCE_DATA_KEY_ID` and `INSTANCE_DATA_KEY` explicitly on every replica. Pods with independent keys cannot decrypt each other's SMTP or federation secrets.

**Rotation:** future key providers should support one active data key for new writes and older decrypt-only keys until stored values are re-encrypted. Until that ships, key changes are a maintenance event.

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
  - name: INSTANCE_DATA_KEY_ID
    valueFrom:
      secretKeyRef:
        name: z0-auth-instance-keys
        key: data_key_id
  - name: INSTANCE_TOKEN_KEY_ID
    valueFrom:
      secretKeyRef:
        name: z0-auth-instance-keys
        key: token_key_id
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

Generate the instance keys once: `bun run generate-keys`.

**Do not** run production pods with generated `.data/` keys or independent volumes — each pod would use different keys and SMTP decryption / reset links would fail unpredictably.

### Reset tokens

Signed payload (`uid`, `exp`, `jti`); `password_reset_tokens.token_hash` stores `jti` for one-time use. Old links stop working when token keys rotate; SMTP secrets require data key stability or re-configuration.

Reset token format:

```text
z0rt.v1.<base64url-kid>.<base64url-payload>.<base64url-signature>
```

---

## Rate limits (current)

| Action | Limit | Window | Error |
|--------|-------|--------|-------|
| Setup | 3 / IP | 1 hour | **429** `rate_limited`, field `_rate`, optional `retryAfter` |
| Failed login | 10 / trusted client IP + normalized email | 15 minutes | **429** `rate_limited`, field `_rate` |
| OAuth confidential client auth (`/oauth/token`, `/oauth/revoke`, `/oauth/introspect`) | 10 / trusted client IP + `client_id` | 15 minutes | **429** `invalid_client` |

Rate-limit counters are stored in PostgreSQL so replicas share enforcement. `X-Forwarded-For` is ignored unless `TRUST_PROXY_HOPS` explicitly identifies the trusted proxy chain.

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
