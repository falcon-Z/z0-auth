---
applyTo: "**/*"
description: "Repository-wide engineering standards for test-first development, folder boundaries, and mandatory OpenAPI synchronization"
---

# Z0 Auth Engineering Instructions

These instructions are mandatory for all Copilot-generated changes in this repository.

## 1) Testing-First Development

- Testing is higher priority than development speed.
- For every new implementation, including a small function, add tests in the same change.
- Do not merge implementation-only changes without tests unless explicitly approved by maintainers.
- Target maximum practical code coverage and prioritize meaningful branch/path coverage.

## 2) Test Folder Structure

- All tests must live under `tests/`.
- `tests/` must mirror the implementation structure for easy navigation.
- Keep path parity between source and tests whenever possible.

Examples:
- `src/api/auth/login.ts` -> `tests/api/auth/login.test.ts`
- `src/app/components/SetupWizard.tsx` -> `tests/app/components/SetupWizard.test.tsx`
- `src/lib/crypto.ts` -> `tests/lib/crypto.test.ts`

## 3) Source Folder Boundaries

- `src/app/` contains frontend code only (React UI, client behavior, browser concerns).
- `src/api/` contains backend/server code only (handlers, server routing, API contracts).
- Use Bun file-based routing in server/API implementation when appropriate.

## 4) Abstraction Placement

- Shared abstractions must be placed in their proper dedicated locations.
- Utilities belong in `src/lib/`.
- Database-related code belongs in `database/` and/or a dedicated DB module folder.
- Avoid mixing frontend/server/db concerns in the same module.

## 5) OpenAPI Is Mandatory

- Every API endpoint must have an OpenAPI specification in `docs/openapi/` as YAML (`*.yaml`).
- OpenAPI specs must use the latest stable OpenAPI standard (currently OpenAPI 3.1.x).
- Specs must be compatible with tooling import workflows (for example Postman OpenAPI import).
- Keep a consolidated root spec (for example `docs/openapi/openapi.yaml`) that references or includes all implemented endpoints.
- Any API change, even small, must include corresponding OpenAPI updates in the same change.
- OpenAPI specs must stay in sync with implemented behavior, schemas, status codes, and errors.
- Follow proper REST API design guidelines in endpoint and schema definitions.

### Human-Readable API Docs

- Markdown files under `docs/openapi/` are human-readable usage guides only.
- Each API Markdown guide must include:
	- a short "when to use" section,
	- authentication/context requirements,
	- request/response examples,
	- copy-pastable `curl` examples for common and failure flows.
- Do not treat Markdown usage docs as the machine-consumable API contract; YAML OpenAPI is the source of truth.

## 6) Documentation Placement

- Keep formal product and API docs under `docs/`.
- Keep executable SQL migrations under `database/migrations/`.
- Design notes and architecture docs should prefer `docs/` unless there is a strong reason to colocate with code.

## 7) PR/Change Checklist

Before considering a task complete, confirm:
- Tests added/updated for every changed behavior.
- Test paths mirror implementation paths.
- Frontend/backend boundaries respected (`src/app` vs `src/api`).
- Abstractions in correct folders (`src/lib`, `database`, etc.).
- OpenAPI updated in `docs/` for every API change.
- OpenAPI YAML updated in `docs/openapi/*.yaml` for every API change.
- Human-readable API docs updated with usage notes and `curl` examples.
- Documentation and implementation are synchronized.
