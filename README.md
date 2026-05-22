# z0-auth

Cloud-native, self-hostable IAM / authentication server (baseline scaffold). Bring your own PostgreSQL database; backend uses **Bun builtins only**.

## Structure

```
src/
  server.ts          # Bun.serve entry + startup checks
  app/               # Frontend (React + React Router console, auth pages)
  api/               # Backend HTTP modules
    auth/            # /api/auth/*
    health/          # /api/health, /api/live, /api/ready
    v1/              # /api/v1/* resource APIs
tests/               # Mirrors src/
docs/                # Architecture + OpenAPI references
scripts/             # DB reset/setup
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for routing, naming notes, and dependency policy.

## Quick start

```bash
bun install
cp .env.example .env   # adjust DATABASE_URL if needed
bun run db:reset       # requires local Postgres
bun dev
```

**First run:** open http://localhost:3000/setup and create your organization and super admin account, then sign in at `/login`.

Optional production hardening:

- Set `INSTALL_TOKEN` before exposing the instance; pass `X-Install-Token` on `POST /api/setup`.
- Complete setup before production traffic; otherwise set `ALLOW_INCOMPLETE_SETUP=true` only for maintenance.

- Console SPA: http://localhost:3000/ (after setup + sign-in)
- Setup: http://localhost:3000/setup
- Auth UI: http://localhost:3000/login
- Health: http://localhost:3000/api/health

See [docs/api/ui-flows.md](docs/api/ui-flows.md) for UI redirect behavior.

## Scripts

| Script | Description |
|--------|-------------|
| `bun dev` | Dev server with HMR |
| `bun start` | Production server |
| `bun run build` | Build frontend HTML bundles to `dist/` |
| `bun test` | Run tests |
| `bun run db:reset` | Drop `public` schema and apply baseline SQL |

## Troubleshooting

**Postgres `sorry, too many clients already`:** stray `bun dev`, `bun test`, or `bun src/server.ts` processes can hold connections. Stop them before `db:reset` or tests:

```bash
pgrep -a bun          # list processes
pkill -f "bun.*server" # or kill specific PIDs
```

Tests use `--concurrency 1` to limit parallel DB use; still avoid running `bun dev` and `bun test` against the same database at once.

## OpenAPI

- [health.openapi.yaml](docs/api/references/health.openapi.yaml)
- [setup.openapi.yaml](docs/api/references/setup.openapi.yaml)
- [auth.openapi.yaml](docs/api/references/auth.openapi.yaml)
