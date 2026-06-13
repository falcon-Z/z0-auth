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
3. **New user:** set name + password → accept → session → console (`/`).
4. **Existing user:** sign in (must match invite email) → **Accept** or **Decline**.
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
