# z0-auth

Cloud-native, self-hostable IAM / authentication server. Bring your own PostgreSQL database; core server uses **Bun builtins only**.

## Structure

```
packages/
  contracts/     # Shared API types and validation (@z0/contracts)
  server/        # Bun HTTP server: JSON API + HTML auth pages (@z0/server)
tests/
docs/
```

Auth pages (`/setup`, `/login`, `/register`, `/forgot-password`) are **HTML served by the server**, not a React SPA. JSON lives under `/api/*`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for routing and dependency policy.

## Quick start

```bash
bun install
cp .env.example .env   # adjust DATABASE_URL if needed
bun run db:reset       # requires local Postgres
bun dev
```

**First run:** open http://localhost:3000/setup and create your organization and super admin account, then sign in at `/login`.

Optional production hardening:

- Set `INSTALL_TOKEN` before exposing the instance; pass `X-Install-Token` on `POST /api/setup` (API) when using programmatic setup.
- Complete setup before production traffic; otherwise set `ALLOW_INCOMPLETE_SETUP=true` only for maintenance.

- Setup: http://localhost:3000/setup
- Sign in: http://localhost:3000/login
- Health: http://localhost:3000/api/health

See [docs/api/ui-flows.md](docs/api/ui-flows.md) for redirect behavior.

## Scripts

| Script | Description |
|--------|-------------|
| `bun dev` | Dev server (`@z0/server`) |
| `bun start` | Production server |
| `bun test` | Run tests |
| `bun run db:reset` | Drop `public` schema and apply baseline SQL |

## Troubleshooting

**Postgres `sorry, too many clients already`:** stop stray `bun dev` or test processes before `db:reset` or tests.

Tests use `--concurrency 1` to limit parallel DB use.

## OpenAPI

- [health.openapi.yaml](docs/api/references/health.openapi.yaml)
- [setup.openapi.yaml](docs/api/references/setup.openapi.yaml)
- [auth.openapi.yaml](docs/api/references/auth.openapi.yaml)
