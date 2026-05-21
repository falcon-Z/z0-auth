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

1. **`/api/*`** — JSON API (health, auth, v1 resources).
2. **`/login`, `/register`, `/forgot-password`** — Dedicated HTML entry points with minimal bundles (shadcn UI, no full console SPA).
3. **`/` and `/*`** — Management console SPA (`src/app/console`).

This keeps public authentication UI separate from the operator console while using a single server process.

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
- `bun run db:reset` drops `public` and applies `scripts/sql/schema.sql` (local dev only).

## Frontend dependencies

React, React Router, Tailwind, and shadcn/Radix are **frontend-only** dependencies used by `src/app/*`. They are not loaded by API route handlers.
