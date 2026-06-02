# z0-auth architecture

## Layout

| Path | Role |
|------|------|
| `src/server.ts` | Bun process entrypoint (`Bun.serve`) and route-map assembly. |
| `src/api/` | JSON API route maps under `/api/*` (`health`, `setup`, `auth`, `v1`). |
| `src/web/auth/` | Server-rendered auth pages under `/auth/*` with HTMX enhancement. |
| `src/web/oauth/` | Browser-facing OAuth authorization flow routes (`/oauth/*`). |
| `src/lib/contracts/` | Shared validation/types imported by server and tests. |
| `src/app/console/` | React + shadcn management console SPA entry and modules. |
| `tests/` | Integration and unit tests. |
| `docs/api/` | API contracts, validation matrix, OpenAPI (`references/*.openapi.yaml`). |

## Routing (`Bun.serve`)

All routing is declared explicitly in `routes` (no `fetch` dispatcher):

1. `...authWebRoutes` for `/auth/*`
2. `...oauthWebRoutes` for `/oauth/*`
3. `...apiRoutes` for `/api/*` (assembled via spread from `...healthApiRoutes`, `...setupApiRoutes`, `...authApiRoutes`, `...v1ApiRoutes`)
4. `"/"` + `"/*"` serve `src/app/console/index.html` for SPA entry/deep links

Route precedence is critical: `/*` is always last so API/auth routes are never shadowed.

## Backend dependencies

The server runtime uses Bun built-ins (`Bun.serve`, `bun:sql`, native Request/Response) plus project dependencies required for console and UI.

## Server bind address

- **`PORT`** — listen port.
- **`BIND_ADDRESS`** — defaults to `127.0.0.1` in development and `0.0.0.0` in production.
- Do **not** use `HOST` for listen configuration.

## Database

- Connection via `DATABASE_URL` (PostgreSQL).
- `bun run db:reset` drops `public`, applies `src/scripts/sql/schema.sql`, then ordered migrations.
- **Data model:** [data-model.md](./data-model.md) (single-account instance model; no internal multi-tenancy).

## Security model (phase 1)

Normative detail: [docs/api/security-contract.md](api/security-contract.md).

- **Setup:** one-time setup via `POST /api/setup` (JSON) or `POST /auth/setup` (form).
- **CSRF:** cookie `z0_csrf` + header `X-CSRF-Token` (API) or hidden `_csrf` field (HTML forms).
- **Sessions:** HttpOnly cookie `z0_session` (14-day absolute lifetime).
- **Guarding setup state:** APIs are wrapped with `applySetupGuard` so protected routes return `503 SetupRequired` before setup completes.
- **Errors:** JSON problem responses with `requestId` — see [docs/api/CONTRACTS.md](api/CONTRACTS.md).

## URL ownership contract

- `/auth/*` — server HTML pages (setup/login/register/forgot/logout)
- `/oauth/*` — authorization-server browser flow
- `/api/*` — JSON-only API surface (for console + external clients)
- `/` and SPA deep links — React console shell
