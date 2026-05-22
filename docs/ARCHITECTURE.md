# z0-auth architecture

## Layout

| Path | Role |
|------|------|
| `packages/contracts/` | Shared types and validation (`@z0/contracts`). |
| `packages/server/src/api/` | JSON HTTP handlers (`/api/*`). |
| `packages/server/src/web/` | HTML auth pages and static CSS. |
| `packages/server/src/server.ts` | Process entry: `Bun.serve` routing. |
| `tests/` | Integration and unit tests. |
| `docs/api/references/` | OpenAPI specifications. |

## Routing (`Bun.serve`)

1. **`routes`** — HTML pages: `/`, `/setup`, `/login`, `/register`, `/forgot-password`, `/logout`, `/static/auth.css`.
2. **`fetch`** — `/api/*` JSON only (health, auth, setup, v1).

Each HTML route runs a **server-side guard** first (setup complete? session?) and returns **302** or the page.

## Backend dependencies

The server package uses **Bun’s built-in toolset** only (`Bun.serve`, `bun:sql`, env loading). No Hono/Elysia.

## Server bind address

- **`PORT`** — listen port.
- **`BIND_ADDRESS`** — defaults to `127.0.0.1` in development and `0.0.0.0` in production.
- Do **not** use `HOST` for listen configuration.

## Database

- Connection via `DATABASE_URL` (PostgreSQL).
- `bun run db:reset` — drops `public`, applies `packages/server/scripts/sql/schema.sql` and migrations.

## Phase 1 security

- **Setup:** one-time `POST /api/setup` or `POST /setup` (HTML form).
- **CSRF:** cookie `z0_csrf` + header `X-CSRF-Token` (API) or hidden `_csrf` field (HTML forms).
- **Sessions:** HttpOnly cookie `z0_session`.
- **Contracts:** `@z0/contracts` imported by server and tests.

## Console (later)

Management UI will be a separate workspace package and OAuth client. It is not part of the core server bundle.
