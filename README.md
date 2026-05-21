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

- Console SPA: http://localhost:3000/
- Auth UI: http://localhost:3000/login
- Health: http://localhost:3000/api/health

## Scripts

| Script | Description |
|--------|-------------|
| `bun dev` | Dev server with HMR |
| `bun start` | Production server |
| `bun run build` | Build frontend HTML bundles to `dist/` |
| `bun test` | Run tests |
| `bun run db:reset` | Drop `public` schema and apply baseline SQL |

## OpenAPI

Health endpoints: [docs/api/references/health.openapi.yaml](docs/api/references/health.openapi.yaml)
