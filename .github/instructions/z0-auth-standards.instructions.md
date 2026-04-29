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
- Prefer assertions on user-visible behavior, operator-facing copy, routes, and outcomes over tests that only prove internal implementation details.

## 1.1) User-Facing Copy and Local URL Safety

- Shipped runtime banners, UI copy, and docs must not leak internal roadmap, phase, milestone, or GA terminology unless explicitly required by approved scope.
- Local startup and operator guidance must default to `localhost` display URLs.
- Do not use ambient machine or container hostnames for user-facing local URLs. Only show a different display host when an explicit configuration value is provided for that purpose.

## 2) Test Folder Structure

- All tests must live under `tests/`.
- `tests/` must mirror the implementation structure for easy navigation.
- Keep path parity between source and tests whenever possible.

Examples:
- `src/api/v1/users/users.ts` -> `tests/api/v1/users/users.test.ts`
- `src/api/core/health/health.ts` -> `tests/api/core/health/health.test.ts`
- `src/app/components/SetupWizard.tsx` -> `tests/app/components/SetupWizard.test.tsx`
- `src/lib/crypto.ts` -> `tests/lib/crypto.test.ts`

## 3) Source Folder Boundaries

- `src/app/` contains frontend code only (React UI, client behavior, browser concerns).
- `src/api/` contains backend/server code only (handlers, server routing, API contracts).
- Versioned API endpoints must use module directories under `src/api/v{n}/<module>/<module>.ts`.
- Compatibility/core endpoints that stay unversioned (for example health and discovery-compatible surfaces) must live under `src/api/core/<module>/<module>.ts`.
- Use Bun file-based routing in server/API implementation when appropriate.

## 4) Import Alias Standard

- Internal imports must use the `@z0` alias instead of deep relative paths.
- Use `@z0/src/...` for source modules and `@z0/database/...` for database modules.
- Avoid introducing new `../` import chains for internal code unless there is a justified tooling constraint.

## 5) Abstraction Placement

- Shared abstractions must be placed in their proper dedicated locations.
- Utilities belong in `src/lib/`.
- Database-related code belongs in `database/` and/or a dedicated DB module folder.
- Avoid mixing frontend/server/db concerns in the same module.

## 6) OpenAPI Is Mandatory

- Every API endpoint must have an OpenAPI specification under `docs/openapi/specs/` as YAML (`*.yaml`).
- OpenAPI specs must use the latest stable OpenAPI standard (currently OpenAPI 3.1.x).
- Specs must be compatible with tooling import workflows (for example Postman OpenAPI import).
- Keep a consolidated root spec at `docs/openapi/specs/openapi.yaml` that references or includes all implemented endpoints.
- Any API change, even small, must include corresponding OpenAPI updates in the same change.
- OpenAPI specs must stay in sync with implemented behavior, schemas, status codes, and errors.
- Follow proper REST API design guidelines in endpoint and schema definitions.

### Human-Readable API Docs

- Markdown files under `docs/openapi/docs/` are human-readable usage guides only.
- Each API Markdown guide must include:
	- a short "when to use" section,
	- authentication/context requirements,
	- request/response examples,
	- copy-pastable `curl` examples for common and failure flows.
- Do not treat Markdown usage docs as the machine-consumable API contract; YAML OpenAPI is the source of truth.

## 7) Documentation Placement

- Keep formal product and API docs under `docs/`.
- Keep executable SQL migrations under `database/migrations/`.
- Design notes and architecture docs should prefer `docs/` unless there is a strong reason to colocate with code.

## 8) UI Design Standards Are Mandatory

- For all frontend/UI work, `docs/UI_DESIGN_GUIDELINES.md` is the canonical design standard.
- Agents and contributors must align UI behavior, visual tokens, and interaction patterns with that document.
- New UI work must use the gray-neutral baseline token direction defined in the design guideline document.
- Form UX must follow the form rules in the design guideline document (Adam Silver style principles).
- If requested UI changes conflict with the design guideline document, ask for explicit user/maintainer approval before diverging.

## 9) PR/Change Checklist

Before considering a task complete, confirm:
- Tests added/updated for every changed behavior.
- Test paths mirror implementation paths.
- Frontend/backend boundaries respected (`src/app` vs `src/api`).
- API module placement follows `src/api/v{n}/<module>/<module>.ts` and `src/api/core/<module>/<module>.ts`.
- Internal imports use `@z0` alias paths.
- Abstractions in correct folders (`src/lib`, `database`, etc.).
- OpenAPI updated in `docs/` for every API change.
- OpenAPI YAML updated in `docs/openapi/specs/**/*.yaml` (including `docs/openapi/specs/openapi.yaml` when needed) for every API change.
- Human-readable API docs updated with usage notes and `curl` examples.
- Documentation and implementation are synchronized.
- UI changes checked against `docs/UI_DESIGN_GUIDELINES.md` and `docs/FRONTEND_SCOPE.md`.
