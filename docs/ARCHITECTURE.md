# z0-auth architecture (baseline)

## Layout

| Path | Role |
|------|------|
| `src/app/` | Frontend (React). Management console SPA and lightweight public auth pages. |
| `src/api/` | Backend HTTP handlers. Bun builtins only — no extra server runtime deps. |
| `src/api/auth/` | Authentication JSON endpoints (`/api/auth/*`). |
| `src/api/v1/` | Versioned CRUD/resource modules (`/api/v1/*`). |
| `src/api/health/` | Liveness, readiness, and composite health checks. |
| `src/server.ts` | Process entry: startup checks + `Bun.serve` routing. |
| `tests/` | Mirrors `src/` for discoverability. |
| `docs/api/references/` | OpenAPI specifications. |

## Routing (`Bun.serve`)

Bun matches routes by specificity (exact → params → wildcard):

1. **`fetch` handler** — only `/api/*` JSON (health, auth, setup, v1).
2. **`/`** — server redirect (setup → `/setup`, signed out → `/login`, signed in → `/console`).
3. **`/login`, `/register`, `/forgot-password`, `/setup`, `/console`, `/console/*`** — single HTML import (`src/app/index.html`); one React bundle, client routes in `src/app/app-routes.tsx`.
4. **`/*`** — SPA fallback for deep links and future console paths.

Development uses Bun’s HTML import bundler (HMR). Production uses `bun run build` output from the same entry.

## Naming: alternatives to `api`

The folder is named `api` for familiarity, but these names also fit an IAM codebase:

- **`server`** — emphasizes the Bun process boundary.
- **`platform`** — IAM/platform services (tokens, tenants, policies).
- **`gateway`** — HTTP edge and routing layer.
- **`core`** — domain services shared by HTTP and workers.
- **`identity`** — IAM-specific naming (pairs well with `src/app` for UI).

## Backend dependencies

The backend intentionally uses **Bun’s built-in toolset** (`Bun.serve`, `bun:sql` / `SQL`, env loading, etc.). If a future requirement needs an external package, document it in this file with rationale before adding it.

## Server bind address

- **`PORT`** — primary knob for self-hosters and local dev.
- **`BIND_ADDRESS`** — optional; defaults to `127.0.0.1` in development and `0.0.0.0` in production.
- Do **not** use `HOST` for listen configuration: many shells export `HOST` as the machine hostname (e.g. on WSL), which breaks `http://localhost:PORT`.

## Database

- Connection via `DATABASE_URL` (PostgreSQL).
- `bun run db:reset` drops `public`, applies `scripts/sql/schema.sql`, then ordered files in `scripts/sql/migrations/`.

## Phase 1 security (bootstrap + auth)

- **Setup:** one-time `POST /api/setup` inside a DB transaction (`FOR UPDATE` on `platform_settings`); optional `INSTALL_TOKEN`.
- **CSRF:** double-submit cookie `z0_csrf` + `X-CSRF-Token` on mutating routes; `Origin`/`Referer` checked.
- **Sessions:** HttpOnly cookie `z0_session`; token stored as SHA-256 hash; rotated on login.
- **Password reset:** `POST /api/auth/reset-password` returns **503** until SMTP is configured (later phase).
- **Password policy:** shared rules in `src/shared/contracts/password-policy.ts` (14+ chars, classes, weak list, contextual).
- **Contracts:** TypeScript types in `src/shared/contracts/`; keep OpenAPI references in sync manually.

## Tenants (organizations)

Bootstrap (`POST /api/setup`) creates a **default tenant** from `organizationName` (slug derived automatically). The super admin receives:

- `platform_memberships` — `platform_admin` (platform scope)
- `tenant_memberships` — `tenant_admin` on the default tenant

When adding **platform managers** or other platform users in a later phase, also insert `tenant_memberships` for the default tenant (`platform_settings.default_tenant_id`) so platform operators belong to the root organization.

## Shared contracts

`src/shared/contracts/` is imported by both `src/api/` and `src/app/` (via `@shared/*` path alias) so UI validation matches API responses.

## Frontend dependencies

React, React Router, Tailwind, and shadcn/Radix are **frontend-only** dependencies used by `src/app/*`. They are not loaded by API route handlers.
