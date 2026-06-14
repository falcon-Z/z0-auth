# z0-auth — agent guide

Self-hosted IAM platform (Auth0 / Clerk–like). Developers register apps, get credentials, redirect end users here to authenticate, then we redirect users back to the app signed in.

## Stack

- **Runtime:** Bun — prefer built-ins (e.g. Postgres client); keep external dependencies minimal.
- **Hosted auth** (`/auth/*`): server-rendered HTML + HTMX — login, setup, sign-up, and other core auth routes.
- **Console** (`/`): React management dashboard — shadcn + Tailwind.
- **API** (`/api/*`): JSON for console and integrations.
- **OAuth** (`/oauth/*`): authorization server for app integrations.

## Glossary

| Term | Meaning |
|------|---------|
| **Owner** | Person who deploys and sets up the platform. First signup becomes owner with platform admin role; access to all resources. |
| **Member / developer** | Person invited to the platform. Uses the console to register and manage apps (scoped by role and resource access). |
| **User / app user** | End user of an app registered on the platform. Can access only apps they authenticate to — not the console, not other apps. |
| **Platform / IAM service** | This application. |

## How it works

1. Owner deploys a self-hosted instance; first signup is owner/platform admin.
2. Owner invites **members**; members get console access per role.
3. Members create **applications**, configure redirect URIs, and obtain client credentials.
4. An app redirects its users to our platform for authentication.
5. After successful auth, we redirect the user back to the app.
6. Members may also register as **app users** on any app on the platform.
7. **App users are isolated per app** — credentials for one app do not work for the console or another app.

## Workflow

Todoist (**Auth** project) is the source of truth for what to build. Access it via the Todoist MCP server.

### When I ask to plan

1. **Pick the current open task** — the next incomplete parent/module task (or the one I named).
2. **Investigate** — with product context and what is already built, analyse how this feature fits:
   - what it touches (API, UI, data, docs)
   - whether existing work should change given new information (call this out as an improvement suggestion or change request)
   - goal: a clean, usable product that works out of the box
3. **Present a plan** — what you will build for this task (APIs, UI, docs, migrations, tests). Include **questions or decisions** that need my input.
4. **After alignment** — add **subtasks** to the module in Todoist. Subtasks hold implementation detail; they are the anchors for reaching the module goal.

### After the plan is confirmed

1. **Design** — before coding:
   - **API:** list endpoints, request/response shapes, validations, errors, boundaries, and any other contract detail.
   - **UI** (if in scope): page structure, states (empty, loading, error, success), forms, and navigation.
2. **Get approval** on the design.
3. **Update Todoist** — comment on the parent task with the plan; adjust subtasks if needed.
4. **Implement** — backend → tests → UI (and HTMX auth pages when applicable).

### After implementation

1. Run **all tests**; verify behaviour matches the plan and acceptance criteria.
2. Add **review subtasks** in Todoist for me to review what shipped.
3. **Do not start the next parent/module task** until I explicitly say to move on — even if review subtasks are done. Subtasks within a module do not require that explicit go-ahead; **parent/module tasks do**.
4. At the end of each feature or module, I review the **module as a whole** before we proceed.

## Codebase layout

Imports use the `@z0` alias (see `tsconfig.json`).

### Backend — `src/api/`

Folder structure reflects the resource, e.g. `src/api/v1/members/`. Shared or cross-cutting routes use a common prefix, e.g. `/api/auth/*`.

### Console — `src/console/`

| Path | Purpose |
|------|---------|
| `src/console/components/ui/` | Raw shadcn components (add via shadcn CLI) |
| `src/console/pages/` | Page components |
| `src/console/pages/<page>/components/` | Components specific to that page |
| `src/console/components/<use-case>/` | Reusable components by use case, e.g. `components/auth/` |

Console layout, navigation, and page patterns: **`docs/console-design.md`** (rule: `.cursor/rules/console-design.mdc`).

### Hosted auth (HTMX)

Served from the server (`src/web/auth/`). Follow the existing auth page design and patterns.

### Contracts and docs

- OpenAPI specs (write **before** handlers): `docs/api/references/*.openapi.yaml`
- Validation matrix: `docs/api/validation-matrix.md`
- Data model: `docs/data-model.md`
- Product: `docs/product.md`

## Workspace rules

- `.cursor/rules/todoist.mdc` — tasks, comments, commit links
- `.cursor/rules/openapi-first.mdc` — spec before implementation
- `.cursor/rules/commit-and-push.mdc` — Bugbot + security review before commit/push
- `.cursor/rules/shadcn-ui.mdc` — shadcn CLI first, compose before custom primitives
- `.cursor/rules/console-design.mdc` — console layout, nav, and page patterns
- `.cursor/rules/no-legacy.mdc` — no compatibility redirects; remove or rename directly

## References

- Product: `docs/product.md`
- Console design: `docs/console-design.md`
- Data model: `docs/data-model.md`
- API contracts: `docs/api/`
