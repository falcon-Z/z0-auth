# UI flow contract

Integration tests guard this file and `tests/integration/web-flow.test.ts`.

## Setup incomplete

| Surface | Behavior |
|---------|----------|
| `GET /api/setup/status` | `{ completed: false }` |
| `GET /login`, `/register`, `/forgot-password` | Server **302** to `/setup` |
| `GET /setup` | Setup HTML form |
| Protected `/api/*` (except setup + health) | **503** `SetupRequired` |

## Setup flow

1. User opens `/setup`.
2. `POST /setup` with CSRF — creates org, tenant, super admin.
3. Server **303** redirect to `/login?setup=complete&org=...`.
4. User signs in → `POST /login` → **303** to `/`.

## Authenticated

| Surface | Behavior |
|---------|----------|
| `GET /` | Signed-in home (email + sign out) if session exists; else **302** `/login` |
| `GET /login` | **302** `/` when already signed in |
| Sign out | `POST /logout` → **303** `/login` |

## Password reset

| Surface | Behavior |
|---------|----------|
| `/forgot-password` | Informational HTML until SMTP is configured |
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
