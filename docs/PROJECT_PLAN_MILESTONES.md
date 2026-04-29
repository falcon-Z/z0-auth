# Z0 Auth Project Plan Milestones and Phases

This document is the canonical planning source for roadmap execution. It is versioned in Git, reviewed in PRs, and hosted on GitHub so planning does not depend on local tooling state.

## Planning Source of Truth

- Plan definition and updates: this file.
- Daily execution units: GitHub issues.
- Phase completion and release readiness: GitHub milestones.
- Cross-phase visibility: GitHub Projects board.

## Release Windows

- Core GA target: Q3 2026.
- v1.x Gate A target: Q4 2026.
- v1.x Gate B target: Q1 2027.

## Milestones and Phase Mapping

Each phase below maps to one GitHub milestone named `P{N} - <phase-name>`.

| Phase | Milestone Name | Objective | Exit Criteria |
|---|---|---|---|
| 0 | `P0 - Domain Contract and Scope Freeze` | Lock contract boundaries, actor model, and release gates. | Decision log complete and approved; no open blocking questions for architecture invariants. |
| 1 | `P1 - Bun-Native Service Foundation` | Finalize Bun routing, middleware contract, and transport envelopes. | Stable service skeleton with strict request context and DoD policy in place. |
| 2 | `P2 - PostgreSQL Persistence and Data Model` | Land schema, migrations, tenancy-safe constraints, and token/security storage model. | Forward-only migration chain validated; schema supports tenancy, revocation, consent, API keys, and SMTP state. |
| 3 | `P3 - Bootstrap and Platform Control Plane` | Complete one-time setup flow and platform guardrails. | Bootstrap lock behavior verified; super admin creation path and setup-state flows complete. |
| 4 | `P4 - IAM Core Domain Services` | Deliver tenant/app/identity/session lifecycle APIs and audit emission. | CRUD and lifecycle paths for IAM entities are test-covered and documented. |
| 5 | `P5 - Authentication Core and Token System` | Implement auth methods and token family revocation/replay detection. | Password, magic link, and TOTP flows pass security and integration criteria. |
| 6 | `P6 - OAuth/OIDC Delivery Path` | Provide Core OAuth baseline and own Gate A/B OIDC expansion path. | Core OAuth endpoints are compliant for GA scope; Gate A/B backlog is clearly staged. |
| 7 | `P7 - Security, Compliance, and Operations` | Enforce rate limits, CORS policy classes, CSRF controls, and observability. | Security middleware policy verified by tests and operations telemetry available. |
| 8 | `P8 - Documentation and Developer Experience` | Keep OpenAPI/docs/guides in sync with implementation. | All changed API behavior has matching OpenAPI YAML and usage guide coverage. |
| 9 | `P9 - Testing and Release Gates` | Final quality gate across unit/integration/security/e2e suites. | Release gate criteria pass for Core GA with no unresolved critical defects. |

## Gate Milestones

- `Gate-Core-GA`: tracks Core GA closure requirements.
- `Gate-A-OIDC`: tracks full OIDC completion, consent UX, and protocol hardening.
- `Gate-B-Advanced-Auth`: tracks dynamic registration, passkeys, and social login.

## GitHub Project Management Setup

Use one GitHub Project board called `Z0 Auth - Core GA and v1.x Gates`.

Recommended columns:

- `Backlog`
- `Ready`
- `In Progress`
- `Review`
- `Blocked`
- `Done`

Recommended custom fields:

- `Phase`: `P0` to `P9`.
- `Gate`: `Core-GA`, `A`, `B`, or `N/A`.
- `Area`: `api`, `app`, `db`, `security`, `docs`, `tests`, `frontend`, `ops`.
- `Risk`: `low`, `medium`, `high`.
- `DoD`: `pending`, `complete`.

## Issue Label Taxonomy

Use labels consistently so GitHub project views remain trustworthy.

- `phase:p0` ... `phase:p9`
- `gate:core-ga`, `gate:a`, `gate:b`
- `area:api`, `area:db`, `area:security`, `area:docs`, `area:tests`, `area:frontend`, `area:ops`
- `type:feature`, `type:bug`, `type:hardening`, `type:docs`, `type:test`, `type:decision`
- `priority:p0`, `priority:p1`, `priority:p2`, `priority:p3`
- `status:blocked` (only when actively blocked)

## Epic and Task Structure

For each phase milestone:

1. Create one phase epic issue named `Phase {N}: <title>`.
2. Add acceptance criteria copied from the `Exit Criteria` column above.
3. Link child issues with task lists in the epic body.
4. Attach all child issues to the phase milestone.
5. Add gate label when the issue contributes to a release gate.

Suggested epic checklist sections:

- `Contract and design decisions`
- `Implementation`
- `OpenAPI and docs`
- `Tests and validation`
- `Release gate verification`

## PR and Completion Policy

Every behavior change PR must include:

- linked issue and phase milestone,
- tests updated under `tests/` with path parity,
- OpenAPI YAML updates under `docs/openapi/` for API changes,
- human-readable API usage doc updates when behavior changes.

An issue is only moved to `Done` when:

- implementation is merged,
- tests pass,
- docs and OpenAPI are synchronized,
- DoD checklist is marked complete.

## Milestone Health Review Cadence

Run one planning review each week and post a milestone health summary in GitHub:

- completed this week,
- in progress,
- blocked items,
- scope changes,
- risk changes,
- next-week focus.

## Change Control for This Plan

If this roadmap changes:

1. update this file in a PR,
2. reference decision rationale in the PR body,
3. update affected milestone descriptions and epic acceptance criteria,
4. communicate the delta in the weekly milestone review.
