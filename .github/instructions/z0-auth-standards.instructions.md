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

### Frontend Module and Component Structure

- Organize frontend app routing/guards by module, not by route-labeled filenames.
- Use module-first paths under `src/app/`.
- Root app entry guard belongs in `src/app/index.tsx`.
- Auth route surfaces belong under `src/app/auth/` (for example `signin.tsx`, `signout.tsx`, `register.tsx`).
- Setup surfaces belong under `src/app/setup/` (for example `setup.tsx`).
- Console/operator surfaces belong under their module folders (for example `src/app/console/console.tsx`).
- Keep filenames simple and understandable. Do not append generic suffixes like `-route`, `-component`, or `-page` unless explicitly required.
- Module-specific components in `src/components/` must live under module folders, for example `src/components/auth/login-button.tsx`.
- Keep shared, cross-module primitives under `src/components/ui/`.

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

## 7) Documentation Placement and Writing Standards

- Keep formal product and API docs under `docs/`.
- Keep agent workflow instructions, engineering standards, and build-process guidance under `.github/instructions/`.
- Keep executable SQL migrations under `database/migrations/`.
- Do not place agent instructions, phase references, or development-process notes in `docs/` or `README.md`.
- All documentation must follow the tone, structure, and content rules in `.github/instructions/documentation-writing-standards.instructions.md`.

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
- Frontend module structure follows `src/app/index.tsx` plus module folders (`src/app/auth`, `src/app/setup`, etc.) with simple filenames.
- Module-specific components are organized under `src/components/<module>/` (for example `src/components/auth/login-button.tsx`) and shared primitives remain in `src/components/ui/`.
- API module placement follows `src/api/v{n}/<module>/<module>.ts` and `src/api/core/<module>/<module>.ts`.
- Internal imports use `@z0` alias paths.
- Abstractions in correct folders (`src/lib`, `database`, etc.).
- OpenAPI updated in `docs/` for every API change.
- OpenAPI YAML updated in `docs/openapi/specs/**/*.yaml` (including `docs/openapi/specs/openapi.yaml` when needed) for every API change.
- Human-readable API docs updated with usage notes and `curl` examples.
- Documentation and implementation are synchronized.
- UI changes checked against `docs/UI_DESIGN_GUIDELINES.md` and `docs/FRONTEND_SCOPE.md`.
