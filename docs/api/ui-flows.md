# UI flow contract

This document defines redirect and API behavior the React shells rely on. Integration test `tests/integration/ui-contract.test.ts` guards this file.

## Setup incomplete

| Surface | Behavior |
|---------|----------|
| `GET /api/setup/status` | `{ completed: false }` |
| `/` | Server **302** to `/setup`, `/login`, or `/console` |
| `/console` | Console SPA (after server guard on `/` only) |
| `/login`, `/register`, `/forgot-password` | Redirect to `/setup` |
| Protected `/api/*` (except setup + health) | **503** `SetupRequired` |

## Setup flow

1. User opens `/setup`.
2. `GET /api/setup/status` — if `completed`, redirect `/login`.
3. `POST /api/setup` with CSRF — **201** returns user and default tenant.
4. Browser redirects to `/login` with a one-time setup flash (session storage).
5. User signs in → `/` → console.

## Authenticated console

| Surface | Behavior |
|---------|----------|
| `/`, `/console` | `GET /api/auth/session` — if not authenticated, redirect `/login` |
| Sign out | `POST /api/auth/logout` → redirect `/login` |

## Password reset

| Surface | Behavior |
|---------|----------|
| `/forgot-password` | Informational UI; reset not available until SMTP |
| `POST /api/auth/reset-password` | **503** until SMTP is configured |

## HTTP status codes (auth/setup)

| Code | When |
|------|------|
| 201 | Setup succeeded |
| 409 | Setup already completed |
| 403 | CSRF or install token failure |
| 429 | Rate limited |
| 503 | API used before setup complete, or password reset unavailable |
