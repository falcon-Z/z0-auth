---
applyTo: "**/*"
description: "Governance rules for chained multi-agent phase workflow with mandatory user approvals and standards-first validation."
---

# Agent Workflow Governance

These rules apply whenever project work is executed using chained agents.

## 1) Human Approval Gates

- The user is the final decision-maker for scope, tradeoffs, and stage progression.
- Agents must ask for user confirmation before moving from one phase/stage to the next.
- If requirements are ambiguous or conflicting, pause and ask concise clarification questions.

## 2) API/Backend Delivery Loop (Mandatory)

Required sequence for each new phase implementation:
1. Codebase discovery agent maps reusable components, abstractions, and existing patterns.
2. Task planner agent creates scoped, broken-down implementation tasks.
3. Implementation agent builds code changes for the approved task slice only.
4. API test agent writes or updates tests for changed behavior.
5. OpenAPI spec agent updates YAML under `docs/openapi/specs/` when API behavior changes.
6. Documentation agent updates usage guides under `docs/openapi/docs/` and related user-facing docs.
7. Repeat steps 3-6 until the phase scope is complete.
8. Review agent inspects implementation against standards and produces prioritized findings.
9. If findings exist, remediation agent fixes findings, then review agent re-runs.
10. Repeat remediation plus review until clear, then request user approval to progress.

## 3) UI Integration and Validation Loop

- UI integration starts only after relevant API capability is complete and reviewed.
- Before UI implementation, agents must load and align with `docs/UI_DESIGN_GUIDELINES.md` and `docs/FRONTEND_SCOPE.md`.
- Integration agent implements UI and integration surfaces against approved contracts.
- UI test agent writes or updates UI and integration tests.
- Review agent inspects UI and integration quality.
- Repeat UI implementation plus UI testing plus review loop until clear.
- If design guidelines are incomplete or conflicting, run design philosophy agent first and request user approval.

## 4) Standards and Documentation Integrity

- Every behavior change requires corresponding tests.
- User-facing runtime, UI, documentation, and startup copy must not expose internal roadmap, phase, GA, or milestone terminology unless the user explicitly requests that language.
- Local startup banners, examples, and operator-facing local URLs must not leak container or machine hostnames by default; display URLs should use `localhost` unless an explicit display-host override is configured.
- API behavior changes require OpenAPI YAML updates under `docs/openapi/specs/` and usage guide updates under `docs/openapi/docs/`.
- UI behavior changes require alignment with `docs/UI_DESIGN_GUIDELINES.md` and scope checks against `docs/FRONTEND_SCOPE.md`.
- Documentation must be written as end-user and developer guidance, not implementation notes.
- Documentation should explain when to use, required context, examples, failure flows, and operator/developer actions.
- Tests must validate user-visible behavior and outcomes, not only internal implementation details or helper wiring.
- Agents must align implementation, tests, and docs before phase completion.

## 5) Reporting Discipline

Each cycle report must include:
- current stage,
- findings summary,
- remediation status,
- remaining blockers,
- explicit decision requested from user.
