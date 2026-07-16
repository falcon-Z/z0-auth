# Validation matrix (single-account pivot)

This matrix replaces tenant/platform-RBAC driven validation rules.

## `POST /api/setup`

| Input | Rule | Code | HTTP | UI |
|-------|------|------|------|-----|
| `name` | Non-empty trimmed string | `required` | 400 | Inline on name field |
| `email` | Required + valid email | `required` / `invalid_email` | 400 | Inline on email |
| `organizationName` | Non-empty trimmed string | `required` | 400 | Inline on organization field |
| `password` | Min 15, max 128, not compromised/common, excludes name/email context | `password_policy` | 400 | Checklist + inline |
| `passwordConfirm` | Equals `password` | `password_mismatch` | 400 | Inline on confirm |
| CSRF | `X-CSRF-Token` matches cookie and origin check passes | `csrf_invalid` | 403 | Refresh token and retry |
| Install token | Required and valid when configured | `install_token_required` / `install_token_invalid` | 403 | Install token field on `/auth/setup`; `X-Install-Token` on JSON API |
| Schema | Migrations applied (`instance_settings` exists) | `database_unavailable` | 503 | Migration instructions on `/auth/setup` and deploy checklist |
| Platform state | Setup already complete | `setup_complete` | 409 | Redirect to login |

## `GET /api/setup/status`

| Field | Rule | UI |
|-------|------|-----|
| `completed` | Reflects `setup_completed_at` | Redirect to login when true |
| `schemaReady` | Current migration and required core tables exist | Block setup form when false |
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

## MFA (`/api/auth/mfa*` and hosted equivalents)

| Input | Rule | Code | HTTP | UI |
|-------|------|------|------|-----|
| Enrollment | Authenticated exact realm; pending setup expires after 10 minutes | `mfa_already_enabled` / `mfa_enrollment_expired` | 409 | Restart setup |
| TOTP `code` | Exactly six digits after removing spaces; current step ±1; time step not previously accepted | `mfa_code_invalid` | 401 | Inline generic error |
| Recovery `code` | 128-bit Base32 display format; hash exists and is unused | `mfa_code_invalid` / `mfa_recovery_codes_exhausted` | 401 | Inline generic error |
| Challenge cookie | Hashed, unconsumed, matching realm/app/client hashes, expires after 5 minutes | `mfa_challenge_expired` | 401 | Sign in again |
| Challenge attempts | Five failures per challenge and shared identity/IP limits | `rate_limited` | 429 | Sign in again |
| Remember browser | Explicit unchecked choice; 30 days; maximum five; rotate on use | — | 200 / 303 | Show in security page |
| Sensitive console action | Current session has MFA within 10 minutes when actor enrolled | `mfa_step_up_required` | 403 | Prompt, verify, retry once |
| State-changing management | Correct realm session and CSRF | `csrf_invalid` | 403 | Refresh and retry |
| Operator reset | Permission, recent MFA, exact app boundary, not self/owner | `permission_denied` / `mfa_step_up_required` | 403 / 409 | Explain recovery path |

## Passkeys (`/api/auth/passkeys*`)

| Input | Rule | Code | HTTP | UI |
|-------|------|------|------|-----|
| Public origin | Exact configured HTTPS origin, or `http://localhost` in development | `passkey_origin_unavailable` | 503 | Operator guidance |
| Registration session | Exact authenticated realm/app; recent primary proof; fresh strong proof when another strong method exists | `primary_reauthentication_required` / `passkey_step_up_required` | 403 | Reauthenticate or complete TOTP/passkey step-up |
| Registration response | Single-use unexpired challenge; exact origin/RP ID; UP and UV; ES256 or RS256; unique credential | `passkey_verification_failed` / `passkey_state_conflict` | 400 / 409 | Retry setup or use another authenticator |
| Credential count | Maximum ten active passkeys for the identity/app | `passkey_limit_reached` | 409 | Remove an unused passkey |
| Authentication email | Valid email shape; response remains generic for unknown/no-passkey identities | `required` / `passkey_verification_failed` | 400 / 401 | Enter email or use another sign-in method |
| Authentication response | Matching scoped credential and ceremony; valid signature; UP and UV; five attempts maximum | `passkey_verification_failed` / `rate_limited` | 401 / 429 | Sign in again or use fallback |
| `label` | Trimmed, 1–80 characters | `passkey_name_invalid` | 400 | Inline |
| Rename/remove | Credential belongs to current exact realm/app; removal has fresh strong proof | `passkey_not_found` / `passkey_step_up_required` | 404 / 403 | Reload or complete step-up |
| State-changing request | Matching session and CSRF; public option/verification routes also enforce origin and request limits | `csrf_invalid` / `rate_limited` | 403 / 429 | Refresh or wait |

## Instance members (`/api/v1/members`)

| Endpoint | Input | Rule | Code | HTTP | UI |
|----------|-------|------|------|------|-----|
| All | Session | Caller is instance member | `permission_denied` | 403 | Redirect or access denied |
| `GET /api/v1/members` | — | — | — | 200 | Members tab list |
| `DELETE /api/v1/members/:userId` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh and retry |
| `DELETE /api/v1/members/:userId` | `userId` | Member exists | `user_not_found` | 404 | Not found state |
| `DELETE /api/v1/members/:userId` | — | Not last active member | `permission_denied` | 409 | Inline error on remove |
| `DELETE /api/v1/members/:userId` | — | Not the instance owner (`is_bootstrap`) | `permission_denied` | 409 | Inline error on remove |
| `GET /api/v1/members` | `status` | `active`, `disabled`, `locked`, or `deleted` | `required` | 400 | Keep current tab |
| `POST …/lifecycle/:action` | CSRF / scope | `members:remove`; valid state; not self, owner, or last active member | `csrf_invalid` / `permission_denied` / `account_state_conflict` | 403 / 409 | Reload detail |
| `POST …/lifecycle/permanently-delete` | `confirmationEmail` | Exact normalized email and already deleted | `required` / `account_state_conflict` | 400 / 409 | Typed confirmation |
| `POST …/password-reset` | Account / SMTP | Active or locked; SMTP ready | `account_state_conflict` / `password_reset_unavailable` | 409 / 503 | Operator notice |
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
| `GET …/users` | `status` | `active`, `disabled`, `locked`, or `deleted` | `required` | 400 | Keep current filter |
| `POST …/lifecycle/:action` | CSRF / permission | `apps.users:manage`; valid transition | `csrf_invalid` / `permission_denied` / `account_state_conflict` | 403 / 409 | Reload detail |
| `POST …/lifecycle/permanently-delete` | `confirmationEmail` | Exact normalized current email; account already deleted | `required` / `account_state_conflict` | 400 / 409 | Typed confirmation |
| `POST …/verification` | Account | Active, unverified app user; SMTP optional | — | 200 | Generic requested notice |
| `POST …/password-reset` | Account / SMTP | Active or locked; configured SMTP | `account_state_conflict` / `password_reset_unavailable` | 409 / 503 | Operator notice |
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
| `GET /oauth/authorize` | `response_type` | Must be `code` | `invalid_request` | 400 | OAuth error page / response |
| `GET /oauth/authorize` | `client_id` | Active credential and active app required | `invalid_client` | 400 | App unavailable state |
| `GET /oauth/authorize` | `redirect_uri` | Exact match with registered URI | `invalid_redirect_uri` | 400 | OAuth error page / response |
| `GET /oauth/authorize` | `scope` | Requested scopes subset of app scope registry | `invalid_scope` | 400 | Scope error with retry |
| `GET /oauth/authorize` | PKCE | Public clients require `code_challenge` + `S256` | `pkce_required` | 400 | PKCE guidance error |
| `GET /oauth/authorize` | Session | No app session for resolved app → login with `client_id` | — | 302 | Hosted login |
| `GET /oauth/authorize` | Session | App session for same app + stored consent covers requested scopes → code redirect | — | 302 | Back to app (skip consent) |
| `GET /oauth/authorize` | Consent | No stored consent or requested scope expands beyond stored → consent screen | — | 200 | Consent screen |
| `GET /oauth/authorize` | Consent | Stored consent superset of request → skip consent, issue code | — | 302 | Back to app |
| `POST /oauth/authorize` | Consent approve | Upsert `oauth_user_consents` with union of stored + requested scopes, then issue code | — | 302 | Back to app |
| `POST /oauth/authorize` | Consent deny | Redirect with `error=access_denied`, preserve `state` | — | 302 | Back to app |
| Cross-app | Same email | Separate `app_users` rows; A password fails on B `client_id` | `invalid_credentials` | 401 | — |

## OAuth token APIs (`/oauth/token`, `/oauth/revoke`)

| Endpoint | Input | Rule | Code | HTTP | UI |
|----------|-------|------|------|------|-----|
| `POST /oauth/token` | `grant_type` | `authorization_code`, `refresh_token`, `client_credentials` | `unsupported_grant_type` | 400 | Integration logs / API client |
| `POST /oauth/token` | `code_verifier` | Required and valid for public clients on code exchange | `invalid_grant` | 400 | Integration logs / API client |
| `POST /oauth/token` | Code exchange success | Returns opaque access token + refresh token | — | 200 | Integration logs / API client |
| `POST /oauth/token` | `refresh_token` grant | Rotates refresh; reuse of old refresh revokes family | `invalid_grant` | 400 | Integration logs / API client |
| `POST /oauth/token` | `client_credentials` | Confidential only; optional scope subset | `unauthorized_client` / `invalid_scope` | 400 | Integration logs / API client |
| `GET /oauth/authorize` | `state` | Required for public clients | `invalid_request` | 400 | OAuth error page |
| `POST /oauth/token` | CORS | `Origin` must match redirect URI origin | — | 403 preflight | Browser integration |
| `GET /oauth/userinfo` | CORS | Same as token endpoint | — | 403 preflight | Browser integration |
| `POST /oauth/revoke` | `token` | Known or unknown token both return success; refresh revokes family | — | 200 | Integration logs / API client |
| `POST /oauth/revoke` | `client_id`/secret | Client authentication rules same as token endpoint | `invalid_client` | 401 | Integration logs / API client |

## OIDC (`/.well-known/*`, `/oauth/userinfo`)

| Endpoint | Input | Rule | Code | HTTP | UI |
|----------|-------|------|------|------|-----|
| `GET /.well-known/openid-configuration` | — | Returns stable issuer and endpoint metadata that matches runtime routes | — | 200 | Integration logs / API client |
| `GET /.well-known/openid-configuration` | `id_token_signing_alg_values_supported` | Includes `RS256` | — | 200 | Integration logs / API client |
| `GET /.well-known/jwks.json` | — | Returns public keys only; no private key material | — | 200 | Integration logs / API client |
| `GET /.well-known/jwks.json` | `kid` | Every active signing `kid` resolves to a public JWK entry | — | 200 | Integration logs / API client |
| `POST /oauth/token` | OIDC scopes | When `openid` is granted, token response includes `id_token` | `invalid_scope` | 400 | Integration logs / API client |
| `POST /oauth/token` | ID token claims | `iss`, `sub`, `aud`, `exp`, `iat` always present; profile/email claims scope-gated | — | 200 | Integration logs / API client |
| `POST /oauth/token` | OIDC `nonce` | When supplied at authorize, included unchanged in the ID token | — | 200 | Integration logs / API client |
| `POST /oauth/introspect` | Client auth | Confidential client Basic or form authentication required; cross-app tokens reported inactive | `invalid_client` | 401 | Resource server |
| `GET /oauth/userinfo` | `Authorization` header | Bearer access token required | `invalid_token` | 401 | Integration logs / API client |
| `GET /oauth/userinfo` | Access token state | Token must be active, unexpired, and not revoked | `invalid_token` | 401 | Integration logs / API client |
| `GET /oauth/userinfo` | Scope to claims | Returns only claims allowed by granted scope | `insufficient_scope` | 403 | Integration logs / API client |

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

## Audit log (`GET /api/v1/audit-events`) — P7M1

| Input | Rule | Code | HTTP | UI |
|-------|------|------|------|-----|
| Session | Instance member with `settings.audit:read` | `permission_denied` | 403 | Activity page error |
| `limit` | Integer 1–100; default 50 | — | 200 | Load more button |
| `before` | Opaque `nextCursor` from previous page containing timestamp and event id | — | 200 | Pagination |
| `action` | Exact match on `audit_events.action` | — | 200 | Future filter UI |
| `resourceType` | Exact match on `audit_events.resource_type` | — | 200 | Future filter UI |
| Success | Newest-first; `nextCursor` is opaque when `hasMore` is true and null otherwise | — | 200 | Activity table |

Append-only: no create/update/delete API. Events written by handlers (auth, members, apps, SMTP, federation, sessions).

## Federation providers (P5)

| Endpoint | Input | Rule | Code | HTTP | UI |
|----------|-------|------|------|------|-----|
| `POST …/providers/from-template` | `builtinId` | One of google, apple, github, facebook | `required` | 400 | Provider picker |
| `POST …/providers/from-template` | Apple | `appleTeamId`, `appleKeyId`, `applePrivateKey` required | `required` | 400 | Apple setup form |
| `POST …/providers/from-template` | Others | `clientId`, `clientSecret` required | `required` | 400 | Credential fields |
| `POST …/providers/from-template` | Duplicate builtin | Key unique | `provider_key_taken` | 409 | Already configured |
| `PUT …/apps/:appId/federation` | `providers[]` | Unique provider ids; must exist | `provider_not_found` | 400 | Sign-in page toggles |
| `GET …/users/:userId/federation/:providerId/token` | Auth | Console `apps.federation:read` or bearer `federation:token` | `permission_denied` / `invalid_scope` | 403 | Server integration |
| `GET …/token` | Token row | Active or auto-refreshable | `federation_token_expired` | 410 | Re-auth prompt |
| `POST …/token/refresh` | Upstream | Refresh grant succeeds | `federation_token_refresh_failed` | 502 | Retry |
| Hosted `/auth/federation/*` | Linking | Verified email auto-link; conflicts blocked | `federation_email_conflict` | 409 HTML | Error card |

## App user sessions — console admin (P7M2)

| Endpoint | Input | Rule | Code | HTTP | UI |
|----------|-------|------|------|------|-----|
| `GET …/users/:userId/sessions` | Scope | `apps.users:read` | `permission_denied` | 403 | App user detail |
| `GET …/users/:userId/sessions` | `userId` | Must belong to `appId` | `app_user_not_found` | 404 | Not found |
| `DELETE …/sessions/:sessionId` | CSRF | Valid token | `csrf_invalid` | 403 | Refresh |
| `DELETE …/sessions/:sessionId` | Scope | `apps.users:manage` | `permission_denied` | 403 | — |
| `DELETE …/sessions/:sessionId` | Session | Active for user | `session_not_found` | 404 | — |
| `DELETE …/sessions/:sessionId` | Success | Writes `app_user_session.revoked` audit | — | 200 | Session removed from table |

## App user sessions — hosted self-service (P7M2)

| Surface | Input | Rule | Code | HTTP | UI |
|---------|-------|------|------|------|-----|
| `GET /auth/sessions` | `client_id` | Valid active app credential | — | 400 | Error page |
| `GET /auth/sessions` | Session | Valid `z0_app_session` for app | — | 302 | Redirect to app login |
| `POST /auth/sessions/revoke` | CSRF + `session_id` | Session belongs to current app user | — | 303 | Back to sessions list |
| `POST /auth/sessions/revoke-others` | CSRF | Keeps current session | — | 303 | Updated list |

Device label and masked IP (`client_label`, `ip_display`) match console session list behavior.

## Notes

- Multi-tenant rules are removed.
- Internal platform role/scope validation rules are removed.
- OAuth scope validation remains only for app-facing OAuth contracts.
