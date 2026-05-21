# Z0 Auth — project guidelines

Engineering standards for contributors and implementers. Architecture and module boundaries are defined in [ARCHITECTURE.md](./ARCHITECTURE.md). Product terminology is in [README.md](../README.md).

---

## 1. Principles

1. **Fail closed** — unauthenticated or unauthorized requests are rejected; never default to permissive behavior.
2. **Tenant isolation** — every query and command that touches tenant data must include an explicit `tenant_id` filter from request context, not from client-supplied body alone.
3. **Scopes are the contract** — roles are convenience; enforcement uses scope strings consistently across API, console, and tokens.
4. **Minimal dependencies** — prefer Bun builtins and PostgreSQL; add a library only with a documented reason.
5. **Audit mutating actions** — if it changes security or configuration state, emit an audit event.
6. **No secrets in logs** — passwords, tokens, API keys, SMTP credentials, and recovery links never appear in logs or audit `metadata`.

---

## 2. Repository layout (API and console are separate)

The admin UI and the API **must not share a source folder**. They are top-level packages so the console can be moved to another repo or CDN later with only environment and CORS changes.

| Path | Allowed content |
|------|-----------------|
| `api/` | Bun server, handlers, modules, DB, HTML views, `api/tests/` |
| `console/` | React SPA, routes, components, `console/tests/` |
| `docs/` | Architecture, guidelines, **`docs/openapi/**`** |
| `e2e/` | Cross-package end-to-end tests |
| `api/dist/`, `console/dist/` | Build output (gitignored) |

**Do not**

- Import anything from `api/` inside `console/` (HTTP only via configured base URL).
- Import anything from `console/` inside `api/` (API may **serve** `console/dist` static files; it must not import React source).
- Place handlers inside `console/` or UI components inside `api/`.
- Add a shared `src/` tree that mixes API and UI code.
- Add alternate API entrypoints without an ADR.

### 2.1 Resource-aligned paths

Code, tests, and OpenAPI specs **share the same resource path** (relative to each root):

| Concern | API example | Console example | OpenAPI example |
|---------|-------------|-----------------|-----------------|
| Tenant CRUD | `api/src/v1/admin/tenants/` | `console/src/routes/.../tenants/` | `docs/openapi/v1/admin/tenants/` |
| Login | `api/src/auth/login.ts` | — (uses HTML view) | `docs/openapi/auth/login.openapi.yaml` |
| Sessions | `api/src/v1/me/sessions/` | `console/src/routes/.../sessions/` | `docs/openapi/v1/me/sessions/` |

When you add `api/src/v1/admin/tenants/create.ts`, add:

- `api/tests/v1/admin/tenants/create.test.ts` (unit)
- `api/tests/v1/admin/tenants/create.integration.test.ts` (if HTTP/DB)
- `docs/openapi/v1/admin/tenants/tenants.openapi.yaml` (update paths/operations)

Console features follow the same mirror under `console/src/` and `console/tests/`.

---

## 3. TypeScript

- Enable **strict** mode in `tsconfig.json`.
- Avoid `any` in public handler signatures and module boundaries; use `unknown` + narrowing.
- Prefer explicit return types on exported functions in `api/src/modules`.
- Use Zod (or similar) for request body validation at the HTTP boundary — validate once, pass typed DTOs inward.

---

## 4. HTTP and REST conventions

### 4.1 URL structure

| Type | Pattern | Example |
|------|---------|---------|
| Auth (unversioned) | `/api/auth/{action}` | `POST /api/auth/login` |
| Versioned REST | `/api/v1/{area}/...` | `GET /api/v1/admin/tenants` |
| End-user | `/api/v1/me/...` | `GET /api/v1/me/sessions` |
| Health | `/api/health` | Liveness + DB ping |
| OAuth/OIDC | `/oauth2/*`, `/.well-known/*` | Spec root — not under `/api/v1` |

**Resource naming**

- Plural nouns for collections: `tenants`, `apps`, `api-keys`.
- Path parameters: `:tenantId`, `:appId` (camelCase param names in docs; consistent in code).
- Nested resources reflect ownership: `/api/v1/admin/tenants/:tenantId/apps/:appId/api-keys`.

### 4.2 HTTP methods

| Method | Usage |
|--------|--------|
| `GET` | Read single or collection; no side effects |
| `POST` | Create resource or action (`/revoke`, `/login`) |
| `PATCH` | Partial update |
| `PUT` | Full replace (avoid unless necessary) |
| `DELETE` | Soft-delete (prefer `deleted_at`) or hard-delete when documented |

### 4.3 Status codes

| Code | When |
|------|------|
| `200` | OK with body |
| `201` | Created; include `Location` when practical |
| `204` | Success, no body |
| `400` | Validation / malformed request |
| `401` | Not authenticated |
| `403` | Authenticated but missing scope |
| `404` | Resource not found (or hidden for IDOR — see security) |
| `409` | Conflict (duplicate slug, version mismatch) |
| `422` | Semantic validation (optional; may use 400) |
| `429` | Rate limited |
| `500` | Unexpected server error (generic message to client) |

### 4.4 Error responses (RFC 7807)

Use `Content-Type: application/problem+json`:

```json
{
  "type": "https://z0-auth.dev/errors/validation",
  "title": "Validation failed",
  "status": 400,
  "detail": "Email is required",
  "instance": "/api/auth/login",
  "errors": [
    { "field": "email", "message": "Required" }
  ]
}
```

- `type` — stable URI or slug per error class.
- `instance` — request path or correlation id.
- Never include stack traces in production responses.

### 4.5 Pagination

**Cursor-based** for audit and large lists:

```json
{
  "data": [],
  "nextCursor": "eyJ..."
}
```

Query: `?limit=50&cursor=...` (default limit 50, max 200).

**Offset** optional for small admin tables only if cursor is awkward; document per resource.

### 4.6 Idempotency

For `POST` that create resources (tenants, API keys, invitations):

- Client may send `Idempotency-Key: <uuid>`.
- Server stores outcome for 24h; replay returns same response.

### 4.7 Versioning

- Breaking REST changes → new prefix `/api/v2`.
- `/api/auth` remains unversioned; breaking auth contract requires explicit migration notes.

---

## 5. Authentication conventions

### 5.1 Session (console + HTML)

- Cookie name: `z0_session` (configurable).
- Flags: `HttpOnly`, `Secure` in production, `SameSite=Lax` (or `Strict` for setup/login only).
- `GET /api/auth/session` returns principal, memberships, effective scopes, `tenantId` context.

### 5.2 Login API

```
POST /api/auth/login
Content-Type: application/json

{ "email": "...", "password": "..." }
```

- On success: `Set-Cookie` + `200` with non-sensitive user summary.
- On failure: `401` Problem Details; rate limit after N failures; audit `auth.login.failed`.

Other auth routes:

| Route | Purpose |
|-------|---------|
| `POST /api/auth/logout` | Revoke current session |
| `POST /api/auth/forgot-password` | Queue reset email |
| `POST /api/auth/reset-password` | Consume reset token |
| `GET /api/auth/verify-email?token=` | Verify email |

### 5.3 Bearer tokens (API)

```
Authorization: Bearer <opaque_access_token>
```

API keys:

```
Authorization: Bearer z0_ak_...
```

or `X-Api-Key: z0_ak_...` (document one preferred; support both if low cost).

### 5.4 OAuth/OIDC

- Implement OAuth 2.1–aligned patterns: PKCE required for public clients, no implicit grant.
- **Access tokens:** opaque only in v1.
- **ID tokens:** JWT; RS256; JWKS published.
- **Refresh tokens:** rotate on each use; reuse detection revokes session family.

### 5.5 Introspection

```
POST /oauth2/introspect
Content-Type: application/x-www-form-urlencoded

token=<token>&token_type_hint=access_token
```

Authenticate client via `client_id` + `client_secret` (confidential) or policies for first-party.

---

## 6. Authorization conventions

### 6.1 Scope format

```
<layer>:<resource>.<action>
```

Examples:

```
platform:tenants.read
platform:tenants.write
tenant:apps.read
tenant:apps.write
tenant:smtp.write
tenant:users.invite
app:oauth-clients.write
app:api-keys.write
app:profiles.schema.write
profile:read
profile:write
audit:read
sessions:read
sessions:revoke
```

Wildcards (e.g. `tenant:*`) are allowed only for built-in super-roles if explicitly registered.

### 6.2 Middleware

Apply in order:

1. `requestId`
2. `tenantContext` — resolve `X-Tenant-Id` (required for tenant/app routes)
3. `authenticate` — session, bearer access token, or API key
4. `authorize(...requiredScopes)` — fail with 403
5. Handler

### 6.3 Layer guards

- Platform routes require platform membership — tenant admin must not call them without platform role.
- App routes require app membership within the tenant in the path.
- Return **404** instead of **403** when revealing resource existence would leak cross-tenant information (IDOR hygiene).

---

## 7. Multi-tenancy

- Primary tenant selection: **`X-Tenant-Id` UUID header** on admin and tenant APIs.
- Platform-global routes omit tenant header.
- Repositories accept `TenantContext` as first argument — never read tenant id from unvalidated JSON for authorization.
- Subdomain-based tenant resolution is a future optional module; do not entangle v1 handlers.

---

## 8. Security

| Topic | Rule |
|-------|------|
| **Passwords** | Argon2id (or bcrypt if Argon2 unavailable in env); unique pepper from env |
| **API keys** | Prefix + high entropy; store hash only; show full key once on create |
| **Tokens** | Store access/refresh token hashes only |
| **SMTP passwords** | Encrypt at rest (AES-GCM with key from env) |
| **CSRF** | HTML forms: SameSite cookies + CSRF token in form hidden field validated on POST |
| **CORS** | Explicit allowlist per deployment; no `*` with credentials |
| **Headers** | Set `X-Content-Type-Options`, `X-Frame-Options` or CSP on HTML views |
| **Rate limits** | Login, introspect, token, forgot-password — per IP + per identifier |

---

## 9. Audit logging

Emit from handlers **after** successful mutation (or on auth failure for login):

```ts
audit.emit({
  action: "tenant.app.create",
  actorPrincipalId,
  tenantId,
  appId,
  resourceType: "app",
  resourceId: app.id,
  metadata: { name: app.name }, // no secrets
});
```

**Actions** use dot-separated verbs: `{domain}.{resource}.{verb}`.

Query requires `audit:read` at the appropriate layer.

---

## 10. Email (SMTP)

- **Platform SMTP** — fallback for system messages.
- **Tenant SMTP** — when `smtp_configs` row exists for tenant, all tenant user mail uses it.
- Queue mail in `email_outbox`; background worker in-process (Bun) for v1.
- Templates: `verify-email`, `reset-password`, `invite-user`, `security-new-device`.

---

## 11. Database

- Raw SQL migrations in `api/src/db/migrations/` — numbered `001_initial.sql`, etc.
- One migration per logical change; never edit applied migrations.
- Use transactions for multi-table commands.
- Foreign keys with `ON DELETE` policies documented per table (prefer soft-delete for tenants/apps).
- All timestamps UTC (`timestamptz`).

---

## 12. HTML views (`api/src/views`)

- No React in server views for v1.
- Share Tailwind classes with console via compiled `shared.css` (built from `console` or shared tokens package).
- Escape all dynamic output to prevent XSS.
- Prefer POST + redirect PRG pattern for forms.

---

## 13. Console (`console/`)

- **React Router** for all post-login navigation.
- Data fetching via `fetch` to `${API_BASE_URL}/api/...` with `credentials: "include"`.
- Centralize HTTP in `console/src/lib/api.ts` — **only** place that knows API URLs; types generated or hand-maintained from OpenAPI.
- Route guards: call `GET /api/auth/session` before admin layouts.
- Keep components presentational; side effects in hooks or route loaders.
- **No imports from `api/`** — console is a standalone frontend package.

**Extracting the console:** copy or submodule `console/`; set `API_BASE_URL`; deploy `console/dist` to any static host; configure API `CONSOLE_ORIGIN` for CORS.

---

## 14. OpenAPI documentation

- Format: **OpenAPI 3.1** YAML per resource (or per small group of operations).
- Location: `docs/openapi/` — path mirrors `api/src/` (see §2.1).
- Naming: `{resource}.openapi.yaml` (e.g. `tenants.openapi.yaml`, `login.openapi.yaml`).
- Each PR that adds or changes an API route **must** update the matching spec (paths, methods, schemas, security, error responses).
- Register security schemes: `sessionCookie`, `bearerAuth`, `apiKey`, `oauth2`.
- Problem Details schema referenced as shared component in `docs/openapi/_components/problem.yaml`.
- Optional root aggregator: `docs/openapi/openapi.yaml` with `$ref` to all resources for Postman/gateway import.
- CI (when enabled): validate YAML lint + breaking-change check against previous spec.

---

## 15. Testing

Testing is **required** for new features—not optional polish.

| Layer | Location | When required |
|-------|----------|----------------|
| **Unit** | `api/tests/...` mirrors `api/src/...` | Every module and handler logic change |
| **API integration** | `*.integration.test.ts` beside unit tests | Every new/changed HTTP endpoint |
| **Console unit** | `console/tests/...` mirrors `console/src/...` | Components, hooks, API client |
| **E2E** | `e2e/tests/` | Critical journeys: bootstrap, login, tenant CRUD, introspection |

**Coverage**

- Run `bun test --coverage` in `api/` and `console/`.
- Target: **≥ 80%** line coverage on `api/src/modules` and handlers; **≥ 90%** on `authn`, `authz`, `oidc`.
- Do not merge features that drop coverage below thresholds without explicit review.

**Integration tests**

- Use a dedicated test Postgres database; migrate before suite; truncate or reset between tests.
- Mock SMTP (no real network); mock clock where expiry matters.
- Use test factories for tenants, users, clients.

**E2E**

- Prefer Playwright against API + console build, or HTTP-level E2E for API-only flows.
- Run in CI on main and release branches.

**Definition of done** for an API feature:

1. Handler + module under `api/src/...`
2. Unit + integration tests under matching `api/tests/...`
3. OpenAPI updated under matching `docs/openapi/...`
4. Audit events if mutating

---

## 16. Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Postgres connection string |
| `ISSUER_URL` | Yes | OIDC issuer (public URL) |
| `SESSION_SECRET` | Yes | Cookie signing |
| `TOKEN_SIGNING_KEY` | Yes | JWT ID token signing (PEM or path) |
| `ENCRYPTION_KEY` | Yes | SMTP and sensitive field encryption |
| `NODE_ENV` | Yes | `development` / `production` |

Document new variables in README when introduced.

---

## 17. Git and commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(api): add tenant SMTP admin routes
fix(console): redirect unauthenticated users to login
docs(openapi): document tenant list endpoint
test(api): integration tests for tenant SMTP
chore: migrate frontend to console/
```

Scope examples: `api`, `console`, `e2e`, `openapi`, `db`, `docs`, `build`.

---

## 18. Code review checklist

- [ ] Tenant isolation enforced in repository layer
- [ ] Scopes declared on route and tested
- [ ] Audit event for mutations
- [ ] Problem Details on errors
- [ ] No secrets in logs
- [ ] Migrations included and reversible note in PR description
- [ ] OpenAPI spec updated under matching `docs/openapi/...` path
- [ ] Unit + integration tests under matching `api/tests/...` path
- [ ] Coverage thresholds met (or justified)
- [ ] No `api` ↔ `console` source imports

---

## 19. Deferred (do not implement without ADR)

- WebAuthn passkeys (schema placeholder OK)
- SAML / SCIM federation
- BYO database per tenant
- React SSR
- Microservice split

---

## 20. Related documents

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [README.md](../README.md)
