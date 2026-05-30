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
- Theme tokens: `src/app/console/styles/globals.css`
- Add components: `bunx shadcn@latest add <component>`

## Useful commands

| Command | Purpose |
|---------|---------|
| `bun dev` | Dev server with hot reload |
| `bun test` | Unit + integration tests |
| `bun run db:reset` | Drop schema, migrate (fresh platform) |
