# Z0 Auth - Self-Hosted Authentication & IAM

A production-grade, self-hosted authentication and IAM service optimized for solo maintainers. Built with Bun (TypeScript runtime), PostgreSQL, and a strict definition of done for every feature.

> **Status**: Phase 1 Foundation in progress. Core GA planned for Q3 2026.

---

## Overview

Z0 Auth is designed to be:

- **Bun-native first**: Lowest dependency surface; built on Bun's TypeScript runtime, HTTP server, and PostgreSQL driver
- **PostgreSQL-only in v1**: Single database choice for simplicity and reliability
- **Strict platform/tenant separation**: No cross-tenant vulnerabilities; explicit privilege guards
- **Feature-gated release model**: Core GA (essential auth), Gate A (full OIDC), Gate B (advanced registration)
- **Minimal UI, API-first**: Backend-first architecture; essential frontend surfaces (setup wizard, operator console) deferred to Core GA; full admin UI to Phase 1.x
- **Mandatory quality bar**: Every feature requires API, docs, tests, and security review before merge

---

## Quick Start

### Prerequisites

- Bun >= 1.3.5
- PostgreSQL >= 14
- Docker & Docker Compose (optional, for local dev)

### Local Development

```bash
# Install dependencies
bun install

# Set up environment
cp .env.example .env

# Start development server
bun run dev

# Server runs on http://localhost:3000
# Setup wizard: http://localhost:3000/
# Health: http://localhost:3000/health
```

---

## Architecture

### System Overview

```
Frontend (React 19: Setup Wizard + Minimal Operator Console)
    ↓
Bun HTTP Server (middleware pipeline: auth, authz, rate limiting, CORS)
    ↓
API Transport Layer (endpoints: bootstrap, auth, tenants, apps, etc.)
    ↓
Domain Services (identity, session, auth, authorization, audit)
    ↓
Data Access Layer (PostgreSQL driver, migrations, schemas)
    ↓
PostgreSQL (authoritative data store)
```

### Tenancy Model

```
Platform (super admin)
  ├── Tenant 1 (tenant admin)
  │   ├── App 1
  │   │   ├── Identity 1
  │   │   │   ├── Session
  │   │   │   └── Credentials
  │   │   └── Identity 2
  │   └── App 2
  └── Tenant 2
```

**Privilege Boundaries**: Platform > Tenant > App > Identity (strict isolation)

---

## Release Gates

### Core GA ✅ LOCKED (Q3 2026 target)

**Backend**: Bootstrap, tenant/app/identity lifecycle, email/password/magic-link/TOTP auth, token management, rate limiting, CORS, audit logging

**Frontend** (minimal): Setup wizard, operator console (health + SMTP state), OAuth2 login flows

**Documentation**: OpenAPI specs, deployment guide, architecture decisions, troubleshooting

**Testing**: Unit + integration + authorization matrix + security tests

### v1.x Gate A (Q4 2026 target)

Full OIDC support (discovery, userinfo, jwks, interactive consent UI)

### v1.x Gate B (Q1 2027 target)

Dynamic client registration, passkeys, social login

---

## Project Structure

```
src/
  ├── index.ts              # Bun server + middleware pipeline
  ├── App.tsx               # React setup wizard
  ├── api/                  # HTTP endpoints (Phase 3+)
  ├── app/                  # Domain services (Phase 3+)
  ├── lib/                  # Shared utilities (errors, validation, crypto, etc.)
  └── components/ui/        # shadcn/ui components
database/
  ├── SCHEMA.md             # Database schema documentation
  └── migrations/           # Forward-only SQL migrations (Phase 2+)
docs/
  ├── FRONTEND_SCOPE.md     # Frontend boundaries (Phase 1 ✅)
  ├── FEATURE_DoD.md        # Definition of Done template (Phase 1 ✅)
  ├── DEPLOYMENT.md         # Deployment guide (Phase 8+)
  └── guides/               # Usage guides (Phase 8+)
tests/                      # Test suites (Phase 9+)
```

---

## Core Principles

1. **Bun-native first**: Use Bun's built-ins (HTTP, TypeScript, PostgreSQL driver)
2. **PostgreSQL-only**: Single database choice for v1
3. **Explicit privilege separation**: Platform/tenant/app/identity boundaries enforced
4. **One-time bootstrap**: Secure, cloud-deployment-friendly super admin setup
5. **Mandatory feature DoD**: API + docs + tests + security review for every feature
6. **Tenant isolation by default**: No cross-tenant data exposure
7. **Immutable audit trail**: Append-only event log with soft-delete compliance
8. **Rate limiting as middleware**: Route-class policies; PostgreSQL-backed
9. **Explicit SMTP state**: Email optional; state visible to operators
10. **API-first, UI-optional**: REST API is authoritative; UI is convenience

---

## Phase 0 Decisions - LOCKED ✅

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Access Token Claims** | `{sub, aud, scope, tenant_id, app_id, session_id, iat, exp}` | JWT standard + tenant/app context + session binding |
| **ID Generation** | Database (PostgreSQL UUID triggers) | Single source of truth |
| **Soft-Delete Strategy** | Identities, sessions, credentials, API keys, consent, audit, tenants, apps | Compliance; hard-delete only temporary state |
| **Audit Retention** | 90 days | Compliance window + debugging |
| **API Key Hashing** | Argon2id (PBKDF2 fallback) | Modern algorithm; GPU-resistant |
| **Token Revocation Store** | PostgreSQL-backed | No in-memory authority; multi-instance correctness |
| **SMTP State Machine** | `unconfigured` / `configured` / `misconfigured` | Explicit operator visibility; magic link disabled when unavailable |
| **Rate Limiting** | Route-class middleware with PostgreSQL counters | Uniform enforcement; distributed correctness |
| **CORS Policy** | Endpoint-class enforcement | Browser-facing/server/admin distinctions |
| **Frontend Scope** | Wizard + minimal console (Core GA); full admin UI deferred | Backend-first focus; manageable scope |
| **API Key Format** | Opaque prefixed `z0_pk_<keyId>_<secret>` | Operator-friendly; hashed at rest |
| **Test Seeds** | Deterministic fixtures loaded by test harpers | Reproducible; no environment mutation |

---

## Key Implementation Details

### Authentication Flow

1. User posts email + password to `/auth/login`
2. Credentials validated, session created, tokens issued
3. Access token: short-lived, self-contained JWT
4. Refresh token: stored in PostgreSQL token family, rotated on use (with replay detection)
5. Token revocation: exceptional cases consult PostgreSQL; gateway uses introspection for immediate guarantees

### API Key Design

- **Format**: `z0_pk_<keyId>_<secret>` (opaque, prefixed)
- **Storage**: Only keyId + Argon2id hash stored; secret displayed once on creation
- **Binding**: To tenant, app, actor, scopes, and optional expiry
- **Rotation**: Replace (not modify); old key revoked

### Rate Limiting

- **Route classes**: `bootstrap`, `identity`, `platform`, `tenant`, `admin`
- **Storage**: PostgreSQL sliding-window counters
- **Enforcement**: Bun middleware before business logic
- **Platform defaults**: 10/min (bootstrap), 100/min (identity), 1000/min (platform), 5000/min (tenant), 10000/min (admin)

### CORS Policy

- **Public** (`/.well-known/*`, `/health`): `Access-Control-Allow-Origin: *`
- **Browser** (`/authorize`, `/userinfo`, `/jwks`): Origin-aware CORS headers
- **Server** (`/api/*`): No CORS (server-to-server, use Authorization header)
- **Admin** (`/api/admin/*`): Same-origin only

---

## Development Workflow

### Adding a Feature

1. Define requirements and API contract (Phase 0)
2. Implement using Definition of Done template
3. Write OpenAPI spec + usage guide
4. Add unit + integration + security tests
5. Review all DoD items with maintainer
6. Merge only when complete

### Running Tests

```bash
bun run test                # Run all tests
bun run test:unit          # Unit tests only
bun run test:integration   # Integration tests only
bun run test:security      # Security tests only
```

### Generating Documentation

```bash
bun run docs:generate      # Generate OpenAPI specs
bun run docs:validate      # Validate spec/code parity
```

---

## Security & Compliance

### Security Measures

- **Passwords**: Argon2id hashing; never logged
- **Tokens**: Replay detection via refresh token families; revocation store for exceptions
- **API Keys**: Opaque format; hashed at rest; one-time display
- **Sessions**: HttpOnly, Secure cookies; SameSite=Strict
- **Audit**: All privileged actions logged
- **Tenant isolation**: Query-level tenant scoping; no cross-tenant access
- **Rate limiting**: Multi-instance correct (PostgreSQL-backed)

### Compliance Features

- **GDPR**: User deletion requests, data export, consent tracking
- **SOC 2**: Audit logging, access controls, monitoring
- **HIPAA**: Encryption in transit (deploy-layer TLS); access controls; audit trail

---

## Documentation

- [docs/FRONTEND_SCOPE.md](./docs/FRONTEND_SCOPE.md) - Frontend boundaries and v1.x admin console roadmap
- [docs/FEATURE_DoD.md](./docs/FEATURE_DoD.md) - Definition of Done checklist for all features
- [docs/PRODUCT_GLOSSARY.md](./docs/PRODUCT_GLOSSARY.md) - Canonical product terms, lifecycle verbs, and language rules
- [docs/PROJECT_PLAN_MILESTONES.md](./docs/PROJECT_PLAN_MILESTONES.md) - Canonical GitHub-tracked phase and milestone execution plan
- [docs/openapi/docs/](./docs/openapi/docs/) - Module-organized API usage guides
- [docs/openapi/specs/](./docs/openapi/specs/) - Module-organized OpenAPI YAML contracts (root: openapi.yaml)
- [docs/SCHEMA.md](./database/SCHEMA.md) - PostgreSQL schema documentation
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) - Deployment guide (Phase 8+)

---

## Status & Roadmap

| Phase | Milestone | Status |
|-------|-----------|--------|
| 0 | Domain contract & scope freeze | ✅ LOCKED |
| 1 | Bun-native foundation | 🟡 IN PROGRESS |
| 2 | PostgreSQL persistence | ⏳ Queued |
| 3 | Bootstrap & platform control | ⏳ Queued |
| 4 | IAM core domain services | ⏳ Queued |
| 5 | Authentication & token system | ⏳ Queued |
| 6 | OAuth/OIDC | ⏳ Queued |
| 7 | Security & compliance | ⏳ Queued |
| 8 | Documentation & DX | ⏳ Queued |
| 9 | Testing & release gates | ⏳ Queued |

---

## Support

- **Issues**: [GitHub Issues](https://github.com/falcon-Z/z0-auth/issues)
- **Discussions**: [GitHub Discussions](https://github.com/falcon-Z/z0-auth/discussions)
- **Documentation**: [docs/](./docs/)

---

## License

Apache License 2.0 — See [LICENSE](./LICENSE) for details

This project was created using `bun init` in bun v1.3.5. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
