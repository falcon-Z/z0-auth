# Z0 Auth Product and Engineering Guidelines

## 1) Purpose

This document defines the product specification baseline and engineering execution rules for Z0 Auth.

It answers two questions:
- What we are building.
- How we build it with quality, consistency, and release safety.

This is a binding guide for product, API, backend, frontend, tests, and documentation work.

## 2) Product Definition (What We Are Building)

Z0 Auth is a self-hosted authentication platform for operators who need secure identity and access control with tenant isolation.

Core v1 outcomes:
- Platform bootstrap and operator setup.
- Tenant and app lifecycle management.
- Identity authentication and session lifecycle.
- API key issuance and lifecycle controls.
- Auditability, rate limiting, and deployment health checks.
- Contract-first API behavior through OpenAPI.

Primary interfaces:
- REST API as the system-of-record interface.
- Setup wizard and operator console as convenience surfaces.

## 3) Canonical Domain Model and Language

Canonical hierarchy:
- platform -> tenant -> app -> identity

Canonical terms are mandatory in code, API contracts, schema, tokens, and technical docs.

Language rules:
- Use tenant, not organization/org, in API/schema/token/backend language.
- Use app as product language; use client only in OAuth/OIDC protocol context.
- Use identity in system and API language; user may appear only in simplified UX copy.
- Use lifecycle verbs consistently: create, register, provision, invite, authenticate, authorize, issue, rotate, revoke, suspend, delete.

Source of truth for terms:
- `docs/PRODUCT_GLOSSARY.md`

## 4) Non-Negotiable Runtime and Dependency Policy

Z0 Auth is Bun-first and dependency-minimal by design.

Mandatory rules:
- Server-side implementation must use Bun and TypeScript primitives first.
- New server dependencies are disallowed by default.
- A new server library is allowed only when there is a proven blocker that cannot be resolved with Bun-native or existing project capabilities.

If an exception is required, all of the following must be documented in the PR:
1. The blocker and why it blocks delivery.
2. Alternatives attempted with reasons for rejection.
3. Security, maintenance, and bundle/runtime impact.
4. Rollback or replacement strategy.

Acceptance bar for exceptions:
- Smallest possible library scope.
- No overlap with existing internal utilities.
- No erosion of Bun-native architecture direction.

## 5) Product Specification Requirements

Every feature or change proposal must include:
- Problem statement and operator/user impact.
- Scope and non-goals.
- Canonical domain mapping (platform/tenant/app/identity).
- API contract deltas (endpoints, request/response, errors, authz).
- Data model and migration impact.
- Security considerations.
- Test strategy and acceptance criteria.
- Rollout and rollback considerations.

If any API or schema behavior changes, the OpenAPI spec and related docs must be updated in the same change set.

## 6) Implementation Workflow (How We Build)

### Phase A: Define
- Confirm objective, constraints, and done criteria.
- Confirm canonical language and domain mapping.
- Capture expected API and data impacts.

### Phase B: Plan
- Produce an implementation plan with explicit test plan.
- Identify risk areas, edge cases, and rollback path.
- Identify docs and OpenAPI updates required.

### Phase C: Build
- Implement minimal, auditable changes.
- Preserve tenant isolation and authorization boundaries.
- Keep behavior and contract changes explicit.

### Phase D: Verify
- Run relevant tests and capture results.
- Validate OpenAPI and docs are synchronized.
- Confirm health/deployment implications are addressed.

### Phase E: Close
- Provide pass/fail status against required quality gates.
- List evidence links and any remaining non-blocking follow-ups.

## 7) Strict Codebase Guidelines

### 7.1 API and Contract Integrity
- API changes must include matching OpenAPI updates under `docs/openapi/specs` and usage docs under `docs/openapi/docs`.
- Error responses must be explicit and consistent.
- Authn/authz requirements must be documented per endpoint.

### 7.2 Data and Migrations
- Migrations are forward-only and safe to run in sequence.
- Schema changes must preserve compatibility expectations for current API version.
- Tenant scoping is required for tenant-owned data paths.

### 7.3 Security Baseline
- No secrets in code, logs, or error payloads.
- Validate all inputs and enforce authorization by actor and scope.
- Audit privileged mutations and sensitive lifecycle events.

### 7.4 Testing Baseline
- Add or update tests for every behavior change.
- Include happy path, validation failures, authz checks, and edge cases.
- Run relevant test commands and include outcomes in closure notes.

Current baseline commands:
- `bun test`
- `bun test tests/database`

### 7.5 Observability and Operations
- Keep liveness/readiness semantics stable and meaningful.
- Preserve deployability for Bun runtime targets.
- Document operational impact for startup, health checks, and config.

## 8) Required Quality Gates (Task Completion Criteria)

A task is complete only when all required gates pass:
1. Implementation matches requested behavior and constraints.
2. Tests are added/updated for changed behavior.
3. Relevant test commands are executed and results captured.
4. API/schema changes are reflected in OpenAPI/docs/migrations.
5. Risks, edge cases, and rollback notes are documented.
6. Remaining follow-ups are explicit and non-blocking.

No partial completion status is allowed for required gates.

## 9) Definition of Done Alignment

This document complements and enforces:
- `docs/FEATURE_DoD.md`
- `docs/PRODUCT_GLOSSARY.md`

If there is a conflict, prefer the stricter requirement and update docs to remove ambiguity.

## 10) Pull Request Checklist (Minimum)

Every PR should include:
- Summary of behavior change and domain mapping.
- Evidence of tests run with outcomes.
- OpenAPI/docs/migration updates (or explicit N/A statement).
- Risk and rollback notes.
- Dependency impact statement (must explicitly confirm no new server dependencies, or document exception criteria).

## 11) Change Control for These Guidelines

Changes to this guide require:
- Rationale for change.
- Impact analysis on current workflows.
- Confirmation that DoD, OpenAPI, and glossary references remain aligned.
