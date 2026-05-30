---
name: frontend-design
description: >-
  z0-auth UI standards for console (React) and auth HTML. Use when building or
  changing pages, forms, tables, dialogs, or layout in src/app/console/ or
  src/web/.
---

# Frontend design (z0-auth)

Read this skill before implementing or refactoring UI.

## Audience

- **Console** (`src/app/console/`): **developers** configuring the platform.
- **Auth HTML** (`src/web/auth/`): **end users** signing in, accepting invites, setup.

## Console CRUD modules

1. **List** — table first, title + header actions only.
2. **Detail** — `/resource/:id`, definition list, back link.
3. **Create / update** — dialog or dedicated route, never inline on the list.

Reuse: `ListPageHeader`, `DetailPageHeader`, `DataTable`, `ResourceTabs` from `components/crud/`.

## Copy

- Short labels and button text. No policy essays on page headers.
- Empty states: one line + optional action.

## Forms

- One purpose per field; visible labels; errors on the field (`errors[].field` from API).
- Password flows: match existing auth form patterns in `src/web/html.ts`.
- Destructive actions: confirm on detail page.

## States

Every list and detail handles: **loading** (skeleton), **empty**, **error**, **forbidden** where relevant.

## Stack

- shadcn/ui components under `components/ui/`; add via shadcn CLI when needed.
- Match surrounding file patterns (imports, spacing, `cn()`).

## Permissions

Gate nav and actions with session roles (`lib/tenant-permissions.ts`). Hide nav items the user cannot use.

## Before shipping UI

- [ ] List → detail → dialog flow respected
- [ ] No redundant description text
- [ ] Field errors mapped
- [ ] Works when active tenant changes (console)
