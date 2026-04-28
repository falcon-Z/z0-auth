## Plan: Z0 Auth v1 Core GA and v1.x Gates

Ship a production-grade IAM core first, optimized for a solo maintainer: Bun-native server path, PostgreSQL-only persistence, strict platform-versus-tenant privilege separation, and hard release gates where every feature is blocked until API + docs + tests are complete.

**Steps**
1. Phase 0: Domain Contract and Scope Freeze (blocks all phases)
1. Finalize actor model: platform operators, tenant admins/operators, app end users.
1. Finalize ownership boundaries: Platform -> Tenants -> Apps -> Identities/Sessions.
1. Define immutable authorization invariants: no tenant-crossing access without explicit platform privilege.
1. Freeze `/api/v1` namespace and versioning contract.
1. Freeze release boundaries: Core GA, v1.x Gate A (full OIDC including consent UX and consent APIs), v1.x Gate B (dynamic client registration, passkeys, social login).
1. Declare non-goals for Core GA to prevent scope creep, including a full tenant admin console beyond the minimum setup/operator surfaces required to operate the system.
2. Phase 1: Bun-Native Service Foundation (depends on 1)
1. Replace scaffold routes with module-composed Bun-native routing and middleware pipeline.
1. Define request context contract (request id, actor, tenant, authz result, trace metadata).
1. Standardize transport contracts (error envelope, pagination envelope, validation errors).
1. Add dependency-governance rule: Bun-native by default, external dependency only with documented blocker and ADR.
1. Add feature DoD template to be enforced for every module (endpoint + OpenAPI + usage docs + tests).
1. Define frontend scope split for Core GA: frontend must ship the setup wizard and a minimal operator console for bootstrap verification and essential platform actions; a full tenant/admin management console is not Core GA scope and can remain API-first until later phases.
2. Define global security middleware boundaries in the Bun pipeline: request context, authentication, authorization, global rate limiting hooks, and route-class-based CORS enforcement.
3. Phase 2: PostgreSQL Persistence and Data Model (depends on 2)
1. Implement PostgreSQL adapter as the only v1 DB path.
1. Define schema groups and relations: platform, tenancy, IAM, authz, app clients/credentials, sessions/devices, audit/compliance.
1. Add token security persistence explicitly:
1. `refresh_token_families` and `refresh_token_instances` tables for rotating refresh tokens, replay detection, and family-wide revocation.
1. `access_token_revocations` table for exceptional access-token invalidation and introspection support.
1. `api_keys` table storing key id, prefix, label, tenant/app binding, hashed secret, scope bindings, created_at, expires_at, revoked_at.
1. `email_delivery_configs` and `email_delivery_events` tables for SMTP configuration state, delivery attempts, and operator-visible failures.
1. `consent_grants` table for Gate A consent persistence keyed by tenant, app client, identity, granted scopes, and revocation state.
1. Enforce tenancy-safe indexing and constraints (tenant-aware unique keys, FK boundaries, query indexes by tenant + status + created_at).
1. Define migration policy: forward-only SQL migrations, immutable history, startup migration drift checks.
1. Define deterministic seed policy:
1. bootstrap-only defaults for runtime initialization.
1. dedicated test seed fixtures loaded by test helpers for reproducible E2E and integration runs.
1. no sample production seeds.
1. Keep DAL boundary for future portability, but do not build multi-DB support in v1.
1. Choose revocation storage model now: PostgreSQL is the single source of truth for refresh token families, access token revocations, API key state, and consent grants; no in-memory revocation state is authoritative.
4. Phase 3: Bootstrap and Platform Control Plane (depends on 3)
1. Add setup-state detection endpoint and initialization lock behavior.
1. Implement one-time bootstrap claim token flow suitable for Docker and cloud one-click deployments.
1. Token design: single-use, short-lived or explicit rotate, hashed at rest if persisted, invalidated after success.
1. Super admin creation only via setup wizard UI; never via environment variables.
1. On successful setup: create super admin, create default tenant, bind initial platform and tenant-admin roles, lock setup route.
1. Define constrained offline recovery path for uninitialized instances only.
1. Implement explicit platform privilege guard separate from tenant privilege guard.
1. Add email-delivery setup state to bootstrap:
1. SMTP is optional for initial bootstrap, but its state must be explicit: `unconfigured`, `configured`, or `misconfigured`.
1. If SMTP is not configured, magic-link login is explicitly disabled in both API capability metadata and operator UI; it is never silently unavailable.
1. Setup and operator surfaces must show a warning banner and health detail when email-dependent auth methods are disabled or failing.
5. Phase 4: IAM Core Domain Services (depends on 4)
1. Tenant lifecycle APIs: create, update, deactivate, list, membership operations.
1. App lifecycle APIs: app registration, scopes, redirect URIs, credential issuance and rotation.
1. Credential support in Core GA:
1. client secret.
1. PKCE public clients.
1. API keys.
1. JWT client auth metadata scaffolding.
1. Define API key format and storage:
1. opaque random secret with a public identifier format like `z0_pk_<keyId>_<secret>`.
1. store only the non-secret key id/prefix for lookup and an Argon2id or scrypt-derived hash of the secret at rest.
1. bind each key to tenant, app, actor type, explicit scopes, optional expiry, and revocation state.
1. support one-time secret display on creation and full rotation by replacement, never readback.
1. Identity lifecycle APIs: invite/create, activate/deactivate, profile updates, role/policy assignment, deletion request initiation.
1. Session and device APIs: session listing, device metadata, revoke-one, revoke-all.
1. Enforce actor boundary checks and audit emission for all privileged mutations.
6. Phase 5: Authentication Core and Token System (depends on 5)
1. Implement Core GA auth methods: email/password, magic link, TOTP.
1. Implement access + rotating refresh token architecture with replay detection and token family revocation backed by PostgreSQL tables defined in Phase 2.
1. Access tokens remain self-contained for normal validation, but exceptional revocation and introspection consult PostgreSQL revocation state; Z0 Gateway must use introspection or revocation-aware validation for routes that require immediate revocation guarantees.
1. Bind token claims to tenant, app, session, and effective scope/role claims.
1. Implement lockout/backoff and suspicious-auth event trails.
1. Define sign-out semantics for current session and global session invalidation.
1. Implement magic-link delivery state machine:
1. if SMTP state is `unconfigured` or `misconfigured`, magic-link issuance returns a deterministic capability/validation error and emits an operator audit/event record.
1. successful mail submission records delivery events; transient failures surface retryable failure state, permanent failures surface operator action required.
1. Core GA does not fake success for undeliverable magic links.
7. Phase 6: OAuth/OIDC Delivery Path (depends on 6)
1. Core compatibility baseline: authorize/token foundations, client auth enforcement, and explicit declaration that interactive consent UX is not part of Core GA.
1. v1.x Gate A owns consent and full OIDC completion:
1. consent screen, consent grant/revoke APIs, `prompt=consent` handling, remembered grants, `userinfo`, `jwks`, and discovery metadata.
1. consent persistence uses `consent_grants` from Phase 2 and must support revocation by user and operator.
1. v1.x Gate B: dynamic client registration, passkeys/WebAuthn, social login for platform console.
1. Maintain v1 SSO stance: app-level opt-in only, no default shared cross-app session fabric.
8. Phase 7: Security, Compliance, and Operations (depends on phases 4-7)
1. Rate limiting and abuse throttling live in the Bun server middleware layer, before business handlers and after basic request classification.
1. Use platform-defined global defaults in Core GA with route-class policies (`auth-login`, `auth-magic-link`, `token`, `setup`, `admin-write`); per-tenant overrides are out of Core GA scope.
1. Persist counters and lock windows in PostgreSQL for correctness across instances; process memory may be used only as a best-effort read-through cache, never as the sole enforcement store.
1. Add explicit CORS policy enforcement in the same HTTP middleware layer:
1. browser-facing endpoints such as authorize, userinfo, discovery, jwks, and selected public capability endpoints may emit CORS headers based on app/tenant origin policy.
1. token endpoint is not generically CORS-open; confidential-client token exchange is treated as server-to-server, while public PKCE token flows require explicit allowed-origin handling.
1. admin, setup, and internal operator endpoints are same-origin only by default.
1. CSRF protections for cookie-based flows and explicit bearer-token route handling.
1. Mandatory structured audit logs for actor/action/resource/result with tenant and trace correlation.
1. Structured service logs and Prometheus-friendly metrics endpoint.
1. Health endpoints: live, ready, startup with dependency checks, including email configuration state in readiness details.
1. Compliance workflows: user deletion requests, retention policy hooks, deletion audit trail.
9. Phase 8: Documentation and Developer Experience (parallel with phases 3-8, required to close each module)
1. Maintain OpenAPI as source of truth by module with CI validation and route/spec parity checks.
1. Write usage guides per audience: platform operator, tenant admin, app developer.
1. Publish deployment docs: Docker and Kubernetes with BYO Postgres, bootstrap token operational flow, secret management guidance, SMTP capability states, and token revocation/introspection behavior.
1. Publish dependency policy and exception process documentation.
1. Document the Core GA frontend scope boundary clearly so operator expectations are set before implementation begins.
10. Phase 9: Testing and Release Gates (parallel with implementation; release blocker)
1. Module testing pyramid: unit, integration, authz matrix, protocol tests, regression tests.
1. Security packs: brute-force, lockout, refresh replay, tenant isolation, policy bypass, CSRF/session checks, rate-limit enforcement, and CORS boundary tests.
1. End-to-end acceptance journeys from deterministic seeded state and from blank deployment through bootstrap and full auth lifecycle.
1. Test harness must load reproducible seed fixtures for tenants, apps, identities, API keys, consent grants, and SMTP state without relying on ad hoc environment mutation.
1. Gate criteria:
1. Core GA: bootstrap, tenant/app/identity/session lifecycle, auth methods, token security, API key behavior, rate limiting, CORS policy, audit, docs, tests.
1. Gate A: OIDC completeness including consent flows and protocol conformance.
1. Gate B: advanced registration/auth methods with dedicated threat tests.

**Decisions Required Before Each Phase**
- Before Phase 0: claim schema and authorization vocabulary.
- Before Phase 2: ID generation model, soft-delete strategy, audit retention baseline, and hashing primitive for API keys.
- Before Phase 3: bootstrap token expiry and offline recovery exact semantics, plus SMTP capability policy at install time.
- Before Phase 5: token TTL defaults, replay response policy, and access-token revocation lookup rules for gateway integration.
- Before Phase 6: signing key rotation and metadata publication policy.
- Before Phase 9: CI budget, flake strategy, and minimum risk-based coverage thresholds.

**Deferred Items That Will Constrain Later Phases If Not Decided Early**
- Authorization invariants and tenant boundaries.
- Bootstrap lock model and recovery path.
- Token claim format and revocation semantics.
- Audit event schema and retention rules.
- OpenAPI versioning/deprecation policy.
- Consent UX ownership and PKCE browser-origin policy.

**Architectural Decisions and Rationale**
- Bun-native first: lowest dependency surface, easier long-term maintenance for solo ownership.
- PostgreSQL-only in v1: production-first reliability and reduced complexity.
- Super admin through UI only: prevents credential exposure in env/deploy logs.
- One-time bootstrap token: secure and practical for cloud one-click + Docker.
- Platform and tenant privileges separated: prevents privilege confusion and cross-scope vulnerabilities.
- App-level SSO opt-in in v1: pragmatic balance without full shared session complexity.
- PostgreSQL-backed token revocation store: one authoritative multi-instance source for refresh replay detection, access-token exceptional revocation, introspection, and gateway integration.
- Explicit SMTP capability state: operators must see when email auth is disabled or unhealthy; magic link is disabled explicitly, never silently degraded.
- Consent is Gate A scope, not Core GA: keeps Core GA smaller while still assigning a clear owner for OIDC-complete behavior.
- Global middleware rate limiting with platform defaults: gives a concrete, enforceable security control without adding tenant-level tuning complexity in v1.
- Route-class-based CORS policy: keeps browser-facing endpoints usable while preventing accidental cross-origin exposure of confidential or operator-only surfaces.
- Minimal frontend in Core GA: setup wizard and essential operator surfaces ship first; full admin console breadth is deferred to avoid derailing the backend-first release.
- API keys are opaque, prefixed, and hashed at rest: operator-friendly format without storing reusable secrets in plaintext.
- Core-first release gates: stable base before advanced protocol expansion.
- Mandatory feature DoD: guarantees contract, docs, and quality completeness.

**Relevant Files**
- `/home/madhan/projects/z0-auth/src/index.ts` — Bun-native route composition, middleware ordering, bootstrap-state routing, rate limiting, and CORS enforcement entrypoint.
- `/home/madhan/projects/z0-auth/src/api/` — transport handlers by module.
- `/home/madhan/projects/z0-auth/src/app/` — domain orchestration and authorization services.
- `/home/madhan/projects/z0-auth/src/lib/` — shared validation, crypto wrappers, logging, metrics, errors, rate-limit helpers, CORS policy helpers.
- `/home/madhan/projects/z0-auth/src/App.tsx` — setup wizard and minimal operator shell states.
- `/home/madhan/projects/z0-auth/src/APITester.tsx` — optional internal API validation utility.
- `/home/madhan/projects/z0-auth/README.md` — architecture and quickstart updates.
- `/home/madhan/projects/z0-auth/package.json` — scripts for docs, test, build, quality gates.
- `/home/madhan/projects/z0-auth/.env` — infra-only configuration contract.
- `/home/madhan/projects/z0-auth/docs/openapi/` — source-of-truth API specs.
- `/home/madhan/projects/z0-auth/docs/guides/` — operator/admin/developer usage docs.
- `/home/madhan/projects/z0-auth/database/migrations/` — forward-only SQL migrations for PostgreSQL schema, revocation, consent, API keys, and email state.
- `/home/madhan/projects/z0-auth/tests/` — deterministic fixtures, E2E journeys, security packs, and protocol tests.

**Verification**
1. Confirm all requested capability areas are mapped to explicit phases and release gates.
2. Confirm each phase has dependencies, concrete steps, pre-phase decisions, and deferral risks.
3. Confirm constraints are preserved: Bun-native first, PostgreSQL-only v1, UI-only super admin credential capture, one-time bootstrap token, app-level SSO opt-in.
4. Confirm the previously missing items are now owned explicitly: token revocation store, SMTP state machine, consent, rate limiting model, CORS policy, frontend scope split, API key format/storage, and deterministic test seeds.
5. Confirm Core GA/Gate A/Gate B boundaries are non-overlapping and testable.
6. Confirm DoD is embedded as release-blocking quality policy.

**Open Questions and Further Considerations**
1. Key management for signing and rotation model details for self-hosted operators.
2. Policy rule DSL depth for Core GA versus later ABAC expansion.
3. Tenant ownership transfer and hard-delete semantics before GA.
4. Compatibility contract fields and revocation/introspection expectations for Z0 Gateway and Z0 CRM integration.
5. Minimal compliance profile to claim for v1 documentation.
