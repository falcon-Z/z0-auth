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

## 2) Phase Delivery Loop

Required default sequence:
1. Implementer agent completes approved scope.
2. Quality inspector agent reviews implementation.
3. Fix agent remediates prioritized findings.
4. Quality inspector re-runs.
5. Repeat 3-4 until clear, then request user approval to progress.

## 3) API-to-UI Dependency Rule

- UI integration can start after relevant API capability is completed.
- UI agent may proceed only with complete design guidelines.
- If guidelines are incomplete, run design philosophy agent first and request user approval.

## 4) Standards and Documentation Integrity

- Every behavior change requires corresponding tests.
- API behavior changes require OpenAPI YAML updates under `docs/openapi/specs/` and usage guide updates under `docs/openapi/docs/`.
- Agents must align implementation, tests, and docs before phase completion.

## 5) Reporting Discipline

Each cycle report must include:
- current stage,
- findings summary,
- remediation status,
- remaining blockers,
- explicit decision requested from user.
