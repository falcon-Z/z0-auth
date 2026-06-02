# z0-auth agent

## Project management

- **Todoist** is the project management platform. This project is named **auth** and lives as a sub-project under **z0**. Access Todoist via MCP.
- Todoist tasks are **high level**. When starting a task, produce a **detailed plan** (chat + subtasks with next steps). Need more scope? Add subtasks or follow-up tasks in Todoist — not in code.
- **Planning never goes in app code or user-facing UI.** See `.cursor/rules/todoist-planning.mdc`.
- Before closing a task: all subtasks done, acceptance criteria verified (including UI when in scope). Comment what shipped and how it was verified — then complete.

### Daily plan requests

When I ask for **today's plan**, **plan for today**, or similar:

- Query **only** the Todoist **Auth** project (`##Auth` under **z0**). Do **not** search inbox, routines, or other projects.
- Prioritize **incomplete module tasks** (Module Delivery section) and anything overdue in Auth.
- **Due dates are tracking only** — not hard deadlines. Goal is to **finish tasks as soon as possible**, starting with the highest-value incomplete Auth work.

## Module delivery (backend + UI)

Flow: **plan → define → document → edge cases → implement → test**. Follow repo standards throughout.

See `.cursor/rules/module-delivery.mdc` for full definition of done.

### API + UI modules

1. **Backend first** — OpenAPI, data model, handlers, integration tests stable.
2. **Then UI** — integrate console and/or `/auth/*`; register routes so real pages load (not `ModulePlaceholderPage`).
3. **UI flow** — plan states and interactions first. If backend cannot support the desired flow, **discuss with me**; do not UI-workaround.

## Planning (before implementation)

When starting a task, **plan first** (in Todoist subtasks and chat). The plan should include:

- What we are building
- Which APIs or endpoints will be implemented
- Whether they touch existing APIs or components
- Expected end result
- Validations, errors, and **acceptance criteria**

Think from two angles:

1. **System** — How an action triggers an API; whether the API design fits the action; solutions aligned with product goals (data model, permissions, integration, tests).
2. **User** — Who acts and what they see (flows, empty/loading/error states, success outcome). For console or auth UI, read `.cursor/skills/frontend-design/SKILL.md` and ensure good UX.

If the task is vague, ask clarifying questions. Do not guess scope.

## Commit and push

When I ask to **commit and push** (or similar), read **`.agents/skills/code-review/SKILL.md`**, run CodeRabbit per that skill, fix feedback, then commit and push. See `.cursor/rules/commit-and-push.mdc`.

## Feature alignment

When you propose a feature, share your idea and push back where useful. I should convince you of my plan, or we accept your proposal — so we align on the best solution before building.

## Backend

- Prefer **minimal or no external dependencies**; Bun covers most needs.
- If a third-party library is needed, explain **why** and **how** so we can discuss before adding it.
- **Implementation order:** OpenAPI spec → data model → handlers → integration tests (edge cases), following existing repo patterns.
- **Migrations:** after tests pass, run `bun run db:migrate` on **dev** before closing the task — see `.cursor/rules/database-migrations.mdc`.

## UI

- Stack: **React + shadcn**; add components via shadcn when needed.
- For modules that include UI: **after backend is stable**, plan user flow → implement → verify (smoke or e2e).
- Do not ship dev/planning copy in screens. Unbuilt nav items: minimal empty state only.

## Adding agent instructions

If I ask you to add rules or instructions, write them like this document: simple, unambiguous bullets; clear do/don’t; keep it short.

---

## Glossary

| Term | Meaning |
|------|---------|
| **me** | The person asking you to build this project (product owner), not an end user |
| **you** | The agent building this project from my instructions |

### App terminology

| Term | Meaning |
|------|---------|
| **platform** | The IAM service instance running for one account owner. |
| **organization** | The account owner's organization profile created at signup. No multi-tenant model inside one instance. |
| **user** | Someone using the platform (ambiguous — clarify if needed). |
| **developer** | Registers to use the platform with their app (console). |
| **app** | Application registered with the platform; uses it for authentication and authorization. |
| **app user** | End user of a registered app; signs in through this IAM service. |
