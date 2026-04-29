# Z0 Auth

A self-hosted authentication and identity management server built on [Bun](https://bun.com) and PostgreSQL.

---

## What it does

Z0 Auth provides a multi-tenant authentication backend with:

- **Bootstrap** — one-time secure initialization to register the platform super admin
- **Tenant and app management** — isolated tenants, each with independent applications
- **Identity management** — email/password, magic links, TOTP, and API key authentication
- **Session and token management** — short-lived JWTs, rotating refresh tokens with replay detection, and token revocation
- **Rate limiting** — route-class middleware with PostgreSQL-backed sliding-window counters
- **Audit logging** — append-only event log; soft-delete compliance for all identity data
- **Setup wizard** — browser-based operator setup on first run
- **Health API** — liveness and readiness endpoints for deployment health checks

The REST API is the primary interface. The setup wizard and operator console are convenience surfaces.

---

## Prerequisites

- [Bun](https://bun.com) >= 1.3.5
- PostgreSQL >= 14

---

## Running locally

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL at minimum

# Run database migrations
bun run database/migrate.ts

# Start the server
bun run src/index.ts
```

The server binds to `0.0.0.0:3000` by default and prints startup URLs using `localhost`.

| URL | Purpose |
|-----|---------|
| `http://localhost:3000/` | Setup wizard (first run) |
| `http://localhost:3000/console` | Operator console |
| `http://localhost:3000/health` | Liveness check |
| `http://localhost:3000/.well-known/openapi.json` | OpenAPI spec |

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the server listens on |
| `BIND_HOST` | `0.0.0.0` | Network interface to bind |
| `DISPLAY_HOST` | `localhost` | Hostname shown in startup output |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `NODE_ENV` | — | Set to `production` to disable development helpers |

---

## Project structure

```
src/
  index.ts              Server entry point, routing, and middleware pipeline
  server-startup.ts     Startup readiness checks
  App.tsx               Setup wizard and operator console (React)
  api/                  HTTP endpoint handlers
    core/health/        Liveness and readiness endpoints
    v1/bootstrap/       Bootstrap initialization endpoint
  lib/                  Shared utilities (crypto, validation, errors, rate limiting, CORS)
  components/ui/        Base UI components
database/
  migrations/           Forward-only SQL migrations
  SCHEMA.md             Database schema reference
docs/
  openapi/specs/        OpenAPI YAML contracts
  openapi/docs/         API usage guides
tests/                  Test suites mirroring src/ structure
```

---

## API

The OpenAPI contract lives at [`docs/openapi/specs/openapi.yaml`](./docs/openapi/specs/openapi.yaml).

Usage guides for each API module are under [`docs/openapi/docs/`](./docs/openapi/docs/).

### Tenancy model

```
Platform (super admin)
  └── Tenant
        └── App
              └── Identity (user or service account)
```

Privilege boundaries are enforced at the query level. Platform > Tenant > App > Identity — no cross-tenant access is possible.

### Access tokens

Issued as short-lived JWTs with claims: `sub`, `aud`, `scope`, `tenant_id`, `app_id`, `session_id`, `iat`, `exp`.

### API keys

Format: `z0_pk_<keyId>_<secret>` — opaque, prefixed. Only the key ID and an Argon2id hash are stored. The secret is shown once on creation and cannot be retrieved again.

### CORS

| Endpoint class | Policy |
|----------------|--------|
| `/.well-known/*`, `/health` | `Access-Control-Allow-Origin: *` |
| `/authorize`, `/userinfo`, `/jwks` | Origin-aware |
| `/api/*` | No CORS (server-to-server) |
| `/api/admin/*` | Same-origin only |

---

## Running tests

```bash
bun test
```

Test files mirror the implementation path structure under `tests/`.

---

## Security

- Passwords hashed with Argon2id; never logged
- Refresh tokens rotate on use with replay detection
- API keys stored as Argon2id hashes; secret visible only at creation
- Sessions use HttpOnly, Secure, SameSite=Strict cookies
- All privileged actions written to the audit log
- Rate limiting enforced before business logic on every route class

---

## Documentation

- [API usage guides](./docs/openapi/docs/)
- [OpenAPI specs](./docs/openapi/specs/)
- [Database schema](./database/SCHEMA.md)

---

## License

Apache License 2.0 — see [LICENSE](./LICENSE).
