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
4. User signs in → `POST /auth/login` → **303** to `/`.

## Authenticated

| Surface | Behavior |
|---------|----------|
| `GET /` | Console shell when session exists; else **302** `/auth/login` |
| `GET /auth/login` | **302** `/` when already signed in |
| Sign out | `POST /auth/logout` → **303** `/auth/login` |

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
| `GET /api/v1/audit-events` | JSON list; requires `settings.audit:read` |

## App user sessions — P7M2

| Surface | Behavior |
|---------|----------|
| Console app user detail | Lists active sessions (device, network, last active); **Revoke** per row |
| `GET /auth/sessions?client_id=…` | App user must be signed in (`z0_app_session`); lists devices for that app only |
| `POST /auth/sessions/revoke` | CSRF form; revokes one other session → **303** back to sessions page |
| `POST /auth/sessions/revoke-others` | CSRF form; revokes all except current device → **303** |

Console member self-service sessions remain at `/profile/sessions` (`GET/DELETE /api/v1/sessions`).

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
