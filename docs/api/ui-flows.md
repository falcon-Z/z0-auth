# UI flow contract

Integration tests guard this file and `tests/integration/web-flow.test.ts`.

Field-level validation and error codes: [validation-matrix.md](./validation-matrix.md).  
Security (CSRF, sessions, cookies): [security-contract.md](./security-contract.md).

## Setup incomplete

| Surface | Behavior |
|---------|----------|
| `GET /api/setup/status` | `{ completed: false, schemaReady, installTokenRequired }` |
| `GET /auth/setup` | Setup HTML form, or migration instructions when `schemaReady` is false |
| `GET /auth/login`, `/auth/register`, `/auth/forgot-password` | Server **302** to `/auth/setup` |
| Protected `/api/*` (except setup + health + deploy status) | **503** `SetupRequired` (unless `ALLOW_INCOMPLETE_SETUP=true`) |

## Setup flow

1. User opens `/auth/setup`.
2. `POST /auth/setup` with CSRF — creates owner account and organization profile.
3. Server **303** redirect to `/auth/login?setup=complete&org=...`.

Automated deployments may skip the browser setup form by setting all first-owner bootstrap variables before startup:

- `Z0_BOOTSTRAP_ORG_NAME`
- `Z0_BOOTSTRAP_ADMIN_NAME`
- `Z0_BOOTSTRAP_ADMIN_EMAIL`
- `Z0_BOOTSTRAP_ADMIN_PASSWORD`

If only some bootstrap variables are set, automatic setup does not run and the deploy checklist shows the missing owner fields.
4. User signs in → `POST /auth/login` → **303** to `/`.

## Authenticated

| Surface | Behavior |
|---------|----------|
| `GET /` | Console shell when session exists; else **302** `/auth/login` |
| `GET /auth/login` | **302** `/` when already signed in |
| Sign out | `POST /auth/logout` → **303** `/auth/login` |

## Multi-factor authentication

1. A signed-in console member uses **Profile → Security**, or an app user opens `/auth/security?client_id=…`.
2. Setup shows a local authenticator deep link and manual Base32 key. The pending enrollment expires after 10 minutes.
3. A valid six-digit code enables MFA and shows ten recovery codes exactly once.
4. Later password, magic-link, federation, invitation, or service-group sign-in stops at `/auth/mfa` before a full session or OAuth result is issued.
5. The user enters TOTP or a recovery code and may explicitly remember the browser for 30 days.
6. Users can replace recovery codes, disable MFA, and revoke remembered browsers. Operators can reset eligible target MFA from member/app-user detail pages.

JSON console self-service uses `/api/auth/reauthenticate`, `/api/auth/mfa`, `/enrollment`, `/enrollment/confirm`, `/recovery-codes`, `/challenge`, `/step-up`, and `/remembered-browsers`. Sensitive console actions return `primary_reauthentication_required` for a stale primary-only session or an MFA/passkey step-up code when a factor is enrolled; the console obtains fresh proof and retries the action once.

## Passkeys

1. A signed-in console member opens **Profile → Security**, or an app user opens `/auth/security?client_id=…`, and chooses **Add passkey**. The browser or device performs the WebAuthn prompt; z0-auth never receives the private key.
2. The user can keep up to ten credentials, rename them, and remove them. Registering an additional passkey or removing one asks for fresh TOTP or passkey proof when the session is stale. Users should keep another verified sign-in or recovery method before removing their last passkey.
3. On either hosted login page, the user enters an email and selects **Sign in with a passkey**. z0-auth scopes the browser prompt to the console realm or the exact `client_id` app. A successful assertion issues only that realm's normal session and resumes the safe/OAuth return path.
4. A passkey assertion supplies fresh primary and MFA assurance. Sensitive console actions may open a passkey step-up prompt and retry once. TOTP remains available when enrolled.
5. Unsupported browsers hide or disable passkey actions. Cancellation and missing credentials show a generic local error; users can return to password, magic link, federation, TOTP/recovery code, or an authorized reset where available.

JSON management uses `GET /api/auth/passkeys` and POST endpoints for registration options/verification, authentication options/verification, rename, and removal. Every state-changing request uses CSRF protection and every ceremony response is `no-store`.

## Instance member invite

1. Instance member creates invite in console → receives **invite URL** (copy or `mailto:`).
2. Invitee opens `GET /auth/invite/:token`.
3. **New or returning user:** set name + password → accept → session → console (`/`).
4. **Signed-in existing user:** **Accept** or **Decline** (must match invite email).
5. Wrong signed-in account → sign out and sign in with invited email.

JSON: `GET /api/v1/invites/:token`, `POST .../accept`, `POST .../decline`.  
Console: `GET/POST /api/v1/members/invites`, `GET /api/v1/members`.

Non-members with a valid session are denied console APIs (**403**).

## Password reset

| Surface | Behavior |
|---------|----------|
| `GET /auth/forgot-password` | Email form when SMTP enabled; otherwise informational HTML |
| `POST /auth/forgot-password` | Sends reset email (generic success); HTML + JSON API |
| `GET /auth/reset-password/:token` | New password form when SMTP enabled |
| `POST /auth/reset-password/:token` | Updates password → **303** `/auth/login?reset=complete` |
| `POST /api/auth/forgot-password` | JSON; **503** when SMTP off |
| `POST /api/auth/reset-password` | JSON body with `token`, `password`, `passwordConfirm`; **503** when SMTP off |

## Activity (audit log) — P7M1

| Surface | Behavior |
|---------|----------|
| Console `GET /activity` | Table of recent audit events (sign-ins, config changes); **Load more** uses `before` cursor |
| Console app-user/member detail | Status and verification badges; disable/enable, unlock, reset, delete, restore-as-disabled, and typed-confirmation permanent delete according to permission and owner/self rules |
| Hosted `GET /auth/verify-email/:token` | Preview a single-use app-user verification link; POST confirmation marks the email verified |
| Hosted `GET/POST /auth/verify-email` | Generic resend form; never reveals unknown, verified, disabled, or deleted account state |
| `GET /api/v1/audit-events` | JSON list; requires `settings.audit:read` |

## App user sessions — P7M2

| Surface | Behavior |
|---------|----------|
| Console app user detail | Lists active sessions (device, network, last active); **Revoke** per row |
| `GET /auth/sessions?client_id=…` | App user must be signed in (`z0_app_session`); lists devices for that app only |
| `POST /auth/sessions/revoke` | CSRF form; revokes one other session → **303** back to sessions page |
| `POST /auth/sessions/revoke-others` | CSRF form; revokes all except current device → **303** |
| `GET/POST /auth/security?client_id=…` | App user manages TOTP, recovery codes, and remembered browsers for that exact app identity |

Console member self-service sessions remain at `/profile/sessions` (`GET/DELETE /api/v1/sessions`).

## External sign-in providers (P5)

| Surface | Behavior |
|---------|----------|
| Console **Settings → Sign-in providers** | Configure Google, Apple, GitHub, Facebook (or custom OAuth); callback URL shown per provider |
| Console **App → Sign-in page** | Enable instance providers for the app; order on hosted page |
| Hosted `/auth/login?client_id=…` | Password form plus **Or continue with** provider buttons when enabled |
| `/auth/federation/:key/start` | Redirect to upstream IdP (PKCE/state cookie) |
| `/auth/federation/:key/callback` | Link or create `app_users`, store encrypted upstream tokens, resume OAuth |
| `GET …/users/:userId/federation/:providerId/token` | Console or bearer `federation:token`; auto-refresh when expired |
| `POST …/token/refresh` | Force upstream refresh; bearer allowed without CSRF |

## HTTP status codes (auth/setup)

| Code | When |
|------|------|
| 201 | API setup succeeded |
| 303 | HTML form success redirect |
| 302 | Server guard redirect |
| 409 | Setup already completed |
| 403 | CSRF failure |
| 429 | Rate limited |
| 503 | API before setup complete |

## Application membership and account state

The app-user detail page presents Application membership separately from Account state. Disable membership, Remove membership, and Rejoin application affect only the selected application. Removal retains the Account, credentials, metadata, and stable subject; rejoining does not restore revoked authority.

The Add app user dialog supports New account and Existing account. Existing account uses the operator-visible Account ID to add explicit membership in the same domain while preserving credentials. Suspend account, Enable account, and Delete account describe their effect across every application in the account domain and use separate confirmations.

## Application and Client management

Add app creates the Application with its minimum assurance and initial Client. The Client form chooses interactive sign-in or backend workload purpose and the public/confidential class. Setup lists all child Clients; Add client creates another entry without a new user or membership. Manage edits client label, redirects, explicit browser origins, refresh capability and stronger assurance. Class and purpose remain fixed. Disable/Enable controls child issuance; confidential clients expose Rotate secret with one-time copying. Application Edit manages only its name and minimum assurance.


## Resource configuration

**Apps → Permissions** defines the application's scope vocabulary. **Apps → Resources** registers APIs, exposes selected vocabulary scopes, edits display names/scopes, and permanently retires an API after confirmation. The audience URI is disabled when editing and remains reserved after retirement. **Apps → Setup → Resource access** selects registered APIs for each child Client and the maximum scopes it may request. Removing scopes or access explains the effect on existing grants. Empty permissions mean the Client cannot obtain any Resource access token.

Authorization requests include one exact `resource` URI. Hosted authorization freezes that Resource with the reviewed request. Token exchange and refresh may omit `resource` to inherit it, or repeat the same URI. A different Resource requires an independent authorization grant.

Application and OAuth Client settings place Delete in a low-prominence area at
the bottom. Disabled, Pending Deletion and permanent purge are separate actions.
Pending Deletion shows the recovery deadline and offers Restore and Delete
Permanently; permanent purge is absent on active/disabled registrations. Delete
requires typing the Application ID or Client ID, then a fresh password/MFA/passkey
proof. Delete Permanently repeats confirmation and requires a new proof for that
action. The zero-grace configuration clearly states that Delete is irreversible.
Client deletion leaves sibling clients and Application identities intact;
Application deletion contains every child. Restoration explains that revoked
authorization codes and refresh tokens stay revoked.
