# Local development

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- Docker (for PostgreSQL), or any Postgres 16 instance matching `DATABASE_URL`

## First-time setup

```bash
cp .env.example .env   # if you do not already have .env
bun install
```

### Database

Start Postgres (Docker Desktop with WSL integration enabled):

```bash
docker start z0-auth-postgres 2>/dev/null || docker start z0auth-postgres 2>/dev/null || docker run -d --name z0-auth-postgres \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=z0auth \
  -p 5432:5432 postgres:16
```

Apply schema:

```bash
bun run db:reset    # local dev — wipes data
# or
bun run db:migrate  # production / existing database — applies pending migrations only
```

Complete setup in the browser at `/auth/setup` with your own admin email and password. Those credentials live only in your dev database — the app does not store or print them anywhere.

One-time, create the isolated test database on the same Postgres instance:

```bash
bun run db:test:init
```

This creates `z0auth_test` alongside `z0auth` (same container, different database).

### Run the app

```bash
bun dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). If `DATABASE_URL` or instance keys are missing, the console shows a setup checklist instead of the dashboard — see [deployment.md](./deployment.md).

## Tests and the dev database

Integration tests use **`TEST_DATABASE_URL`** (`z0auth_test` on the same Postgres as dev), loaded from `.env.test` via `tests/preload.ts`. They call `resetTestDatabase()` in `beforeAll`, which drops and migrates **only that test database**.

| Database | Env var | Used by |
|----------|---------|---------|
| `z0auth` | `DATABASE_URL` | `bun dev`, manual browser work |
| `z0auth_test` | `TEST_DATABASE_URL` | `bun test`, Playwright e2e |

Tests still create owner accounts with **dynamic passwords** (full setup → user flows). That state is ephemeral — wiped on every test run and discarded when CI finishes. It never touches your dev database.

If `TEST_DATABASE_URL` matches `DATABASE_URL`, test resets fail fast instead of wiping dev data.

For a clean dev slate, run `bun run db:reset` and complete `/auth/setup` again with credentials you choose.

### Postgres: `too many clients already`

Bun’s SQL client opens a **connection pool** per `new SQL()` (default **10** connections, created eagerly). This repo uses **`max: 1`** via `createPgSql()` so one process holds one connection.

Common causes on a single Docker Postgres:

1. **`bun dev` (`--hot`)** — each hot reload can leave old pools open until you restart the dev process. Restart `bun dev` after many saves, or stop dev before a long `bun test` run.
2. **Dev server + tests + scripts at once** — each process needs its own slot; stop the dev server when running the full test suite.
3. **Stale backends** — list and terminate idle clients:
   ```sql
   SELECT pid, application_name, state, datname
   FROM pg_stat_activity
   WHERE datname IN ('z0auth', 'z0auth_test');
   ```
   Then `SELECT pg_terminate_backend(<pid>);` for orphaned rows (not your active session).

Tests call `closeDatabase()` in file `afterAll` and again in `tests/preload.ts` global `afterAll`.

## Console API building blocks

The management console talks to the same JSON API as external clients. Shared pieces live under `src/app/console/lib/`:

| Module | Role |
|--------|------|
| `http-client.ts` | `apiFetch()` — cookies, CSRF on mutations, `ApiError` from problem+json |
| `api.ts` | Session helpers (`loadSession`, `postLogout`) |
| `form-errors.ts` | Map `errors[].field` from API responses to form state |

Contracts and error codes: `src/lib/contracts/` and [api/README.md](./api/README.md).

## UI (shadcn)

- Config: `components.json` (`baseColor: neutral`, `style: new-york`)
- Theme + Tailwind entry: `src/app/console/styles/globals.css` (imported from `main.tsx`)
- `bunfig.toml` enables `bun-plugin-tailwind` for HTML routes in `Bun.serve` (see [Bun fullstack docs](https://bun.com/docs/bundler/fullstack#tailwindcss-plugin))
- Add components: `bunx shadcn@latest add <component>` (files land in `src/app/console/components/ui/`)

Auth HTML under `/auth/*` uses a separate static stylesheet (`/static/auth.css`), not the console Tailwind pipeline.

Reference minimal setup (outside this repo): `/home/madhan/projects/z0-tailwind-reference`.

### Playwright (console UI)

```bash
# Uses TEST_DATABASE_URL from .env.test when set (resets DB before e2e)
export E2E_PASSWORD='your-strong-password'   # must not contain name/email substrings
bun run test:e2e
```

Optional: `E2E_EMAIL` (default `admin@example.com`), `PLAYWRIGHT_BASE_URL`, `PORT`. Fresh instances: auth setup bootstraps via `/api/setup` when `E2E_PASSWORD` is set.

Install browsers once: `bunx playwright install chromium`. If Playwright reports an unsupported OS, run tests in CI or a supported Linux/macOS host.

### Console shell

The management SPA uses a **shadcn sidebar + header** layout (`AppShell`) and a single navigation catalog:

| File | Role |
|------|------|
| `src/app/console/config/navigation.ts` | All console routes, grouped by area; `status`: `available`, `stub`, or `planned` |
| `src/app/console/routes.tsx` | Registers routes; maps paths to real pages or `ModulePlaceholderPage` |
| `src/app/console/components/layout/ConsolePage.tsx` | Shared page title and description |
| `src/app/console/components/layout/ModulePlaceholderPage.tsx` | Default body for planned modules |

When shipping a module: set `status` to `available` (or `stub`), add the page under `src/app/console/modules/<name>/`, and register it in `routes.tsx` `IMPLEMENTED_PAGES`. Keep API wiring in the module page using `apiFetch` and `form-errors.ts`.

## Useful commands

| Command | Purpose |
|---------|---------|
| `bun dev` | Dev server with hot reload |
| `bun test` | Unit + integration tests (isolated test DB) |
| `bun run db:test:init` | Create `z0auth_test` on existing Postgres |
| `bun run db:reset` | Drop schema, migrate (fresh platform) |
