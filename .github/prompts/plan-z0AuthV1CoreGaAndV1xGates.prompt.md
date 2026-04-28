## Plan: Z0 Auth v1 Core GA and v1.x Gates

Ship a production-grade IAM core first, optimized for a solo maintainer: Bun-native server path, PostgreSQL-only persistence, strict platform-versus-tenant privilege separation, and hard release gates where every feature is blocked until API + docs + tests are complete.

**Steps**
1. Phase 0: Domain Contract and Scope Freeze (blocks all phases)
1. Finalize actor model: platform operators, tenant admins/operators, app end users.
1. Finalize ownership boundaries: Platform -> Tenants -> Apps -> Identities/Sessions.
1. Define immutable authorization invariants: no tenant-crossing access without explicit platform privilege.
1. Freeze `/api/v1` namespace and versioning contract.
1. Freeze release boundaries: Core GA, v1.x Gate A (full OIDC), v1.x Gate B (dynamic client registration, passkeys, social login).
1. Declare non-goals for Core GA to prevent scope creep.
2. Phase 1: Bun-Native Service Foundation (depends on 1)
1. Replace scaffold routes with module-composed Bun-native routing and middleware pipeline.
1. Define request context contract (request id, actor, tenant, authz result, trace metadata).
1. Standardize transport contracts (error envelope, pagination envelope, validation errors).
1. Add dependency-governance rule: Bun-native by default, external dependency only with documented blocker and ADR.
1. Add feature DoD template to be enforced for every module (endpoint + OpenAPI + usage docs + tests).
3. Phase 2: PostgreSQL Persistence and Data Model (depends on 2)
1. Implement PostgreSQL adapter as the only v1 DB path.
1. Define schema groups and relations: platform, tenancy, IAM, authz, app clients/credentials, sessions/devices, audit/compliance.
1. Enforce tenancy-safe indexing and constraints (tenant-aware unique keys, FK boundaries, query indexes by tenant + status + created_at).
1. Define migration policy: forward-only SQL migrations, immutable history, startup migration drift checks.
1. Define seed policy: bootstrap-only defaults, no sample production seeds.
1. Keep DAL boundary for future portability, but do not build multi-DB support in v1.
4. Phase 3: Bootstrap and Platform Control Plane (depends on 3)
1. Add setup-state detection endpoint and initialization lock behavior.
1. Implement one-time bootstrap claim token flow suitable for Docker and cloud one-click deployments.
1. Token design: single-use, short-lived or explicit rotate, hashed at rest if persisted, invalidated after success.
1. Super admin creation only via setup wizard UI; never via environment variables.
1. On successful setup: create super admin, create default tenant, bind initial platform and tenant-admin roles, lock setup route.
1. Define constrained offline recovery path for uninitialized instances only.
1. Implement explicit platform privilege guard separate from tenant privilege guard.
5. Phase 4: IAM Core Domain Services (depends on 4)
1. Tenant lifecycle APIs: create, update, deactivate, list, membership operations.
1. App lifecycle APIs: app registration, scopes, redirect URIs, credential issuance and rotation.
1. Credential support in Core GA: client secret, PKCE public clients, API keys, JWT client auth metadata scaffolding.
1. Identity lifecycle APIs: invite/create, activate/deactivate, profile updates, role/policy assignment, deletion request initiation.
1. Session and device APIs: session listing, device metadata, revoke-one, revoke-all.
1. Enforce actor boundary checks and audit emission for all privileged mutations.
6. Phase 5: Authentication Core and Token System (depends on 5)
1. Implement Core GA auth methods: email/password, magic link, TOTP.
1. Implement access + rotating refresh token architecture with replay detection and token family revocation.
1. Bind token claims to tenant, app, session, and effective scope/role claims.
1. Implement lockout/backoff and suspicious-auth event trails.
1. Define sign-out semantics for current session and global session invalidation.
7. Phase 6: OAuth/OIDC Delivery Path (depends on 6)
1. Core compatibility baseline: authorize/token foundations, consent, client auth enforcement.
1. v1.x Gate A: full OIDC endpoints (userinfo, jwks, discovery) and conformance hardening.
1. v1.x Gate B: dynamic client registration, passkeys/WebAuthn, social login for platform console.
1. Maintain v1 SSO stance: app-level opt-in only, no default shared cross-app session fabric.
8. Phase 7: Security, Compliance, and Operations (depends on phases 4-7)
1. Rate limiting and abuse throttling on auth-critical routes.
1. CSRF protections for cookie-based flows and explicit bearer-token route handling.
1. Mandatory structured audit logs for actor/action/resource/result with tenant and trace correlation.
1. Structured service logs and Prometheus-friendly metrics endpoint.
1. Health endpoints: live, ready, startup with dependency checks.
1. Compliance workflows: user deletion requests, retention policy hooks, deletion audit trail.
9. Phase 8: Documentation and Developer Experience (parallel with phases 3-8, required to close each module)
1. Maintain OpenAPI as source of truth by module with CI validation and route/spec parity checks.
1. Write usage guides per audience: platform operator, tenant admin, app developer.
1. Publish deployment docs: Docker and Kubernetes with BYO Postgres, bootstrap token operational flow, secret management guidance.
1. Publish dependency policy and exception process documentation.
10. Phase 9: Testing and Release Gates (parallel with implementation; release blocker)
1. Module testing pyramid: unit, integration, authz matrix, protocol tests, regression tests.
1. Security packs: brute-force, lockout, refresh replay, tenant isolation, policy bypass, CSRF/session checks.
1. End-to-end acceptance journeys from blank deployment through bootstrap and full auth lifecycle.
1. Gate criteria:
1. Core GA: bootstrap, tenant/app/identity/session lifecycle, auth methods, token security, audit, docs, tests.
1. Gate A: OIDC completeness and protocol conformance.
1. Gate B: advanced registration/auth methods with dedicated threat tests.

**Decisions Required Before Each Phase**
- Before Phase 0: claim schema and authorization vocabulary.
- Before Phase 2: ID generation model, soft-delete strategy, audit retention baseline.
- Before Phase 3: bootstrap token expiry and offline recovery exact semantics.
- Before Phase 5: token TTL defaults and replay response policy.
- Before Phase 6: signing key rotation and metadata publication policy.
- Before Phase 9: CI budget, flake strategy, and minimum risk-based coverage thresholds.

**Deferred Items That Will Constrain Later Phases If Not Decided Early**
- Authorization invariants and tenant boundaries.
- Bootstrap lock model and recovery path.
- Token claim format and revocation semantics.
- Audit event schema and retention rules.
- OpenAPI versioning/deprecation policy.

**Architectural Decisions and Rationale**
- Bun-native first: lowest dependency surface, easier long-term maintenance for solo ownership.
- PostgreSQL-only in v1: production-first reliability and reduced complexity.
- Super admin through UI only: prevents credential exposure in env/deploy logs.
- One-time bootstrap token: secure and practical for cloud one-click + Docker.
- Platform and tenant privileges separated: prevents privilege confusion and cross-scope vulnerabilities.
- App-level SSO opt-in in v1: pragmatic balance without full shared session complexity.
- Core-first release gates: stable base before advanced protocol expansion.
- Mandatory feature DoD: guarantees contract, docs, and quality completeness.

**Relevant Files**
- `/home/madhan/projects/z0-auth/src/index.ts` — Bun-native route composition and bootstrap-state routing.
- `/home/madhan/projects/z0-auth/src/api/` — transport handlers by module.
- `/home/madhan/projects/z0-auth/src/app/` — domain orchestration and authorization services.
- `/home/madhan/projects/z0-auth/src/lib/` — shared validation, crypto wrappers, logging, metrics, errors.
- `/home/madhan/projects/z0-auth/src/App.tsx` — setup wizard and admin shell states.
- `/home/madhan/projects/z0-auth/src/APITester.tsx` — optional internal API validation utility.
- `/home/madhan/projects/z0-auth/README.md` — architecture and quickstart updates.
- `/home/madhan/projects/z0-auth/package.json` — scripts for docs, test, build, quality gates.
- `/home/madhan/projects/z0-auth/.env` — infra-only configuration contract.
- `/home/madhan/projects/z0-auth/docs/openapi/` — source-of-truth API specs.
- `/home/madhan/projects/z0-auth/docs/guides/` — operator/admin/developer usage docs.

**Verification**
1. Confirm all requested capability areas are mapped to explicit phases and release gates.
2. Confirm each phase has dependencies, concrete steps, pre-phase decisions, and deferral risks.
3. Confirm constraints are preserved: Bun-native first, PostgreSQL-only v1, UI-only super admin credential capture, one-time bootstrap token, app-level SSO opt-in.
4. Confirm Core GA/Gate A/Gate B boundaries are non-overlapping and testable.
5. Confirm DoD is embedded as release-blocking quality policy.

**Open Questions and Further Considerations**
1. Key management for signing and rotation model details for self-hosted operators.
2. Policy rule DSL depth for Core GA versus later ABAC expansion.
3. Tenant ownership transfer and hard-delete semantics before GA.
4. Compatibility contract fields for Z0 Gateway and Z0 CRM integration.
5. Minimal compliance profile to claim for v1 documentation.