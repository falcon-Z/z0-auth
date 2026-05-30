# UI flow contract

Integration tests guard this file and `tests/integration/web-flow.test.ts`.

Field-level validation and error codes: [validation-matrix.md](./validation-matrix.md).  
Security (CSRF, sessions, cookies): [security-contract.md](./security-contract.md).

## Setup incomplete

| Surface | Behavior |
|---------|----------|
| `GET /api/setup/status` | `{ completed: false }` |
| `GET /auth/login`, `/auth/register`, `/auth/forgot-password` | Server **302** to `/auth/setup` |
| `GET /auth/setup` | Setup HTML form |
| Protected `/api/*` (except setup + health) | **503** `SetupRequired` |

## Setup flow

1. User opens `/auth/setup`.
2. `POST /auth/setup` with CSRF — creates org, tenant, super admin.
3. Server **303** redirect to `/auth/login?setup=complete&org=...`.
4. User signs in → `POST /auth/login` → **303** to `/`.

## Authenticated

| Surface | Behavior |
|---------|----------|
| `GET /` | Console shell when session exists; else **302** `/auth/login` |
| `GET /auth/login` | **302** `/` when already signed in |
| Sign out | `POST /auth/logout` → **303** `/auth/login` |

## Organization invite

1. Admin creates invite in console → receives **invite URL** (copy or `mailto:`).
2. Invitee opens `GET /auth/invite/:token`.
3. **New user:** set name + password → accept → session → console.
4. **Existing user:** sign in (must match invite email) → **Accept** or **Decline**.
5. Wrong signed-in account → sign out and sign in with invited email.

JSON: `GET /api/v1/invites/:token`, `POST .../accept`, `POST .../decline`.

## Password reset

| Surface | Behavior |
|---------|----------|
| `/auth/forgot-password` | Informational HTML until SMTP is configured |
| `POST /api/auth/reset-password` | **503** until SMTP |

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
