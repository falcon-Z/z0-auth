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
docker start z0auth-postgres 2>/dev/null || docker run -d --name z0auth-postgres \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=z0auth \
  -p 5432:5432 postgres:16
```

Apply schema:

```bash
bun run db:reset
```

Complete setup in the browser at `/auth/setup` with your own admin email and password.

### Run the app

```bash
bun dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Tests and the dev database

Integration tests for **setup, registration guards, and login** call `resetTestDatabase()` in `beforeAll`, which runs the same `DROP SCHEMA` + migrations as `bun run db:reset`. After `bun test`, the database is empty until you set up again.

For manual work, run `bun run db:reset` when you want a clean slate, then complete `/auth/setup` with credentials you choose.

## Console API building blocks

The management console talks to the same JSON API as external clients. Shared pieces live under `src/app/console/lib/`:

| Module | Role |
|--------|------|
| `http-client.ts` | `apiFetch()` — cookies, CSRF on mutations, `ApiError` from problem+json |
| `api.ts` | Session helpers (`loadSession`, `postLogout`, `postActiveTenant`) |
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
export E2E_PASSWORD='your-admin-password'   # same as /auth/setup admin
bun run test:e2e
```

Optional: `E2E_EMAIL` (default `admin@example.com`). Requires platform setup complete and a valid session.

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
| `bun test` | Unit + integration tests |
| `bun run db:reset` | Drop schema, migrate (fresh platform) |
