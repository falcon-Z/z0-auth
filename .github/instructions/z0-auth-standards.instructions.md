---
description: "Use when implementing, reviewing, or planning changes in z0-auth to enforce product language, Bun-first dependency policy, API/OpenAPI parity, and strict delivery quality gates."
applyTo: "src/**,tests/**,docs/**,database/**,scripts/**"
---
# Z0 Auth Engineering Standards

## Product Language
- Use canonical hierarchy: platform -> tenant -> app -> identity.
- In API/schema/token/backend language, always use tenant (not org/organization).
- Use app as product term; use client only in OAuth/OIDC protocol contexts.
- Use identity in system/spec language; use user only for simplified audience-facing copy.

## Runtime and Dependencies
- Backend/server changes must be Bun-first and TypeScript-first.
- Do not add new server dependencies unless an unavoidable blocker is documented.
- If a new server dependency is required, include blocker, alternatives attempted, and risk/rollback notes in the PR.

## API and Docs Contract Integrity
- Any API behavior change must update OpenAPI specs in `docs/openapi/specs/**` and relevant docs in `docs/openapi/docs/**` in the same change.
- Keep request/response/error/authn/authz contracts explicit and consistent.

## Data and Security
- Preserve tenant isolation in queries and authorization logic.
- Validate inputs and enforce authz for privileged operations.
- Never expose secrets in logs, errors, or source.
- Ensure privileged mutations are auditable.

## Testing and Delivery Gates
A task is not complete until all required gates pass:
1. Implementation matches requested behavior and constraints.
2. Tests are added/updated for changed behavior.
3. Relevant tests are executed and outcomes are captured.
4. API/schema/docs/migrations are synchronized for contract changes.
5. Risks, edge cases, and rollback considerations are documented.
6. Remaining follow-ups are listed and clearly non-blocking.

## Working Style
- Prefer minimal, auditable diffs over broad refactors.
- Avoid scope expansion unless explicitly approved.
- When requirements are ambiguous, ask focused clarification before implementation.
