# z0-auth agent

## Product

Self-hosted IAM for app developers (Auth0/Clerk-like): register apps, redirect end users to us, authenticate, return to the app via OAuth/OIDC. Supports **browser (PKCE)** and **server (confidential)** clients. See [docs/product.md](docs/product.md).

## Stack

- Bun monolith: `/api`, `/auth`, `/oauth`, console SPA at `/`
- Console: React + shadcn; auth pages: HTML + HTMX
- Spec-first APIs: OpenAPI + validation matrix under `docs/api/`
- Planning and module status: **Todoist Auth** project (not in app UI)

## Workflow

- **Start a module:** say "start planning" → agent checks open task, closes if already shipped, writes implementation plan for current task (`todoist-planning.mdc`) → align before coding
- **Ship:** plan → OpenAPI/matrix → implement → tests → UI if in scope → `bun run db:migrate` on dev → comment + complete task
- **Rules:** `.cursor/rules/` (module-delivery, todoist-planning, database-migrations, commit-and-push)
- **UI quality:** `.cursor/skills/frontend-design/SKILL.md`
- **Commit/push:** `.agents/skills/code-review/SKILL.md` (CodeRabbit)

## Do

- Backend before UI for API modules; real routes, not placeholders, when a module is done
- Minimal server dependencies; discuss before adding libraries
- Product-facing UI copy only; unbuilt nav → minimal “not available yet”
- Push back and align on features before building

## Don’t

- Put plans, checklists, or Todoist/module IDs in user-facing UI
- UI workarounds when the API does not support the flow — discuss first
- Close Todoist tasks on API tests alone when UI is in scope
- Guess scope on vague tasks

## Glossary

| Term | Meaning |
|------|---------|
| **me** | Product owner (you instruct the agent) |
| **you** | Agent building the project |
| **platform** | This IAM instance (one per deployment) |
| **organization** | Owner profile at signup; not multi-tenant |
| **developer** | Person using the console to manage apps |
| **app** | Customer application registered for auth |
| **app user** | End user of that app (per-app identity) |
