# Feature Definition of Done (DoD) Template

## Overview

Every feature module in Z0 Auth must meet this Definition of Done before it can be merged and considered release-ready. This ensures consistent quality, security, documentation, and testability across all components.

**Phases**: This DoD is enforced for all features starting in Phase 1 and throughout all release gates.

---

## Core DoD Checklist

### 1. Implementation

- [ ] **Code written**: Feature implemented according to specifications
- [ ] **Error handling**: All error paths handled with appropriate error codes and messages
- [ ] **Input validation**: All inputs validated using `ValidationSchema` from `/src/lib/validation.ts`
- [ ] **Request context**: Request context properly propagated through all handlers
- [ ] **Audit logging**: All privileged mutations emit audit events with actor/action/resource/result
- [ ] **Rate limiting hooks**: Auth-critical endpoints have rate limiting applied (Phase 7)
- [ ] **CORS enforcement**: Endpoint class and CORS policy applied correctly (Phase 7)
- [ ] **No hardcoded secrets**: All sensitive data externalized to environment or secure vault
- [ ] **Bun-native dependencies only**: No external packages added without documented blocker and ADR
- [ ] **Tenant isolation**: All queries include tenant context; no cross-tenant data leakage
- [ ] **TypeScript strict mode**: No `any` types; proper type safety throughout

### 2. API Contract

- [ ] **Endpoint defined**: HTTP method, path, and authentication level documented
- [ ] **Request contract**: Request body schema (if POST/PUT) documented and validated
- [ ] **Response contract**: Success response shape and status code documented
- [ ] **Error responses**: All possible error codes and messages listed
- [ ] **Pagination** (if applicable): Limit, offset, total count, hasMore fields included
- [ ] **OpenAPI spec**: Endpoint documented in OpenAPI spec with request/response examples
- [ ] **Status codes**: Appropriate HTTP status codes used (200, 201, 400, 401, 403, 404, 409, 429, 500)
- [ ] **Authentication**: Bearer token, Basic auth, or API key requirement documented
- [ ] **Authorization**: Required authorization levels (platform_admin, tenant_admin, etc.) documented

### 3. Documentation

- [ ] **README**: Brief description of feature and why it exists
- [ ] **Architecture doc**: How the feature fits into the system (if complex)
- [ ] **Glossary alignment**: Terms and action verbs match `docs/PRODUCT_GLOSSARY.md` for product, API, and operator language
- [ ] **API documentation**: OpenAPI spec with examples (platform operator, tenant admin, app developer audiences)
- [ ] **Deployment guide**: Any special configuration or setup required
- [ ] **Troubleshooting**: Common issues and their resolution
- [ ] **Examples**: Code/curl examples for common usage patterns
- [ ] **Security considerations**: Known limitations, attack vectors, rate limiting, tenant isolation notes

### 4. Testing

- [ ] **Unit tests**: Core logic tested with mocked dependencies (database, external services)
- [ ] **Integration tests**: Feature tested with real database and dependencies
- [ ] **Authorization tests**: Endpoint authorization matrix tested (platform/tenant/app/identity actors)
- [ ] **Validation tests**: Invalid inputs tested and rejected appropriately
- [ ] **Error tests**: All error paths tested (missing fields, invalid formats, conflicts, etc.)
- [ ] **Happy path tests**: Normal operation flows tested end-to-end
- [ ] **Edge cases**: Boundary conditions, concurrency, race conditions tested
- [ ] **Security tests** (if applicable):
  - Tenant isolation verified (can't access other tenant data)
  - Rate limiting enforcement verified
  - CSRF/session fixation protection verified (for stateful flows)
  - Input injection prevention verified
  - Privilege escalation prevention verified

### 5. Security & Compliance

- [ ] **Secrets handling**: No secrets in logs, code, or error messages
- [ ] **Password handling**: Passwords hashed via Argon2id, never logged
- [ ] **Token handling**: Tokens handled securely (HttpOnly cookies, no localStorage logging)
- [ ] **SQL injection prevention**: All queries use parameterized statements
- [ ] **CSRF protection**: State-changing operations protected (Phase 7)
- [ ] **Input sanitization**: XSS prevention for any rendered user input
- [ ] **Audit trail**: All actions logged with actor, action, resource, result, timestamp
- [ ] **Data retention**: Soft-delete strategy applied; hard-delete only for temporary data
- [ ] **Compliance**: Feature meets requirements for GDPR, SOC 2, other applicable frameworks

### 6. Performance

- [ ] **Query optimization**: Database queries use appropriate indexes and filters
- [ ] **N+1 problem addressed**: No unnecessary repeated queries
- [ ] **Response time**: Endpoint responds within reasonable time (< 500ms for typical operations)
- [ ] **Pagination implemented**: Large result sets paginated (if applicable)
- [ ] **Caching strategy**: Caching applied where appropriate without sacrificing security
- [ ] **No memory leaks**: Long-running operations don't accumulate memory

### 7. Observability

- [ ] **Logging**: Structured logs at INFO level for key operations, DEBUG for detailed traces
- [ ] **Metrics**: Request count, error rate, latency tracked (Phase 7)
- [ ] **Tracing**: Request ID propagated through all layers for request tracing
- [ ] **Error reporting**: Errors include context for debugging (requestId, actor, resource)
- [ ] **Health checks**: Endpoint health and dependency status checked (Phase 7)

### 8. Code Quality

- [ ] **Linting**: Code passes ESLint and TypeScript compiler with no warnings
- [ ] **Style consistency**: Follows project coding standards and conventions
- [ ] **DRY principle**: No duplicated logic; code reuse where appropriate
- [ ] **Comments**: Complex logic commented; API contracts documented as JSDoc
- [ ] **Maintainability**: Code is readable and maintainable by another developer
- [ ] **Error messages**: User-friendly error messages (not technical jargon or internal details)

### 9. Backwards Compatibility

- [ ] **API versioning**: Endpoint path includes `/v1/` version (breaking changes in `/v2/` only)
- [ ] **Schema evolution**: New fields are optional; old fields remain supported
- [ ] **Deprecation path**: Breaking changes have deprecation period and clear migration guide
- [ ] **Database schema**: New columns are nullable or have defaults; no breaking migrations

---

## Module-Specific DoD

Some modules have additional DoD requirements:

### Authentication Module
- [ ] Multiple auth methods supported (password, magic link, TOTP, etc.)
- [ ] Token replay detection implemented (Phase 5)
- [ ] Lockout/backoff protection implemented
- [ ] Session state management correct
- [ ] Token revocation store (PostgreSQL) consulted for revocation (Phase 5)

### Database Migration
- [ ] Forward-only migration (no rollback script)
- [ ] Migration is idempotent (can be run multiple times safely)
- [ ] Indices created for query optimization
- [ ] Foreign keys and constraints enforce data integrity
- [ ] Soft-delete triggers applied (where applicable)
- [ ] Startup drift detection implemented

### API Key Module
- [ ] Key format is opaque and prefixed (`z0_pk_<keyId>_<secret>`)
- [ ] Secret hashed with Argon2id at rest
- [ ] Key display one-time only on creation
- [ ] Key rotation supported (replacement, not modification)
- [ ] Key binding (tenant, app, scope, expiry) enforced
- [ ] Key revocation removes access immediately

### OAuth2/OIDC Module
- [ ] Discovery endpoint (`/.well-known/openid-configuration`) returns correct metadata
- [ ] Authorization endpoint enforces `redirect_uri` whitelist and `response_type` support
- [ ] Token endpoint enforces client authentication and validates grant type
- [ ] Userinfo endpoint returns correct claims for authenticated user
- [ ] JWKS endpoint publishes public signing keys for verification
- [ ] All OAuth2/OIDC security parameters enforced (code replay, state CSRF, etc.)

### Audit Module
- [ ] Audit events immutable once written
- [ ] All privileged actions logged (create, update, delete, auth attempts, etc.)
- [ ] Sensitive data not logged (passwords, API keys, tokens, etc.)
- [ ] Audit log includes actor, action, resource, result, timestamp, tenant, trace ID
- [ ] Retention policy enforced (default 90 days)
- [ ] Audit logs queryable by tenant operators (with authorization checks)

---

## Review Checklist for Maintainers

Before merging a PR, reviewers should verify:

- [ ] **All DoD items checked** in the feature PR description
- [ ] **Test coverage** meets minimum thresholds (>80% for new code)
- [ ] **Security review**: No obvious vulnerabilities or privilege escalation paths
- [ ] **Database schema** changes reviewed for backwards compatibility
- [ ] **Performance impact**: No significant latency or resource consumption increases
- [ ] **API stability**: Breaking changes handled correctly or deferred to v2
- [ ] **Documentation**: All docs updated; examples work; no stale references

---

## Example PR Description

```markdown
## Feature: Create App Endpoint

### Summary
Implements POST /api/v1/apps endpoint for tenant admins to register new applications with Z0 Auth.

### DoD Checklist
- [x] Implementation: Code written, errors handled, validation applied
- [x] API Contract: Request/response schemas defined, OpenAPI spec updated
- [x] Documentation: README added, examples provided, troubleshooting guide included
- [x] Testing: Unit tests (80% coverage), integration tests, authorization matrix, happy path + error cases
- [x] Security: Input validated, tenant isolation verified, audit event emitted
- [x] Performance: Query uses appropriate indexes, response time <100ms
- [x] Observability: Structured logging, tracing, error context included
- [x] Code Quality: ESLint passing, TypeScript strict mode, DRY principle followed
- [x] Backwards Compatibility: First version, no breaking changes to consider

### Test Results
- Unit tests: 24 passed
- Integration tests: 12 passed
- Security tests: 8 passed (tenant isolation, authz checks, input validation)

### Related Issues
Closes #123
```

---

## Enforcement

- **PR reviews**: All PRs must have at least one approval that verifies DoD checklist
- **Merge blockers**: CI/CD pipeline blocks merge if:
  - Test coverage < 80% for new code
  - Linting or type checking fails
  - Documentation missing or invalid
  - Security scan reports issues
- **Release gates**: Feature cannot be shipped if DoD not met

---

## Evolution

This DoD template is versioned with the codebase. Changes to DoD requirements:
1. Are discussed in architecture meetings
2. Are documented with rationale
3. Are applied to all future features
4. May be backfilled to existing features if critical (e.g., security requirements)

