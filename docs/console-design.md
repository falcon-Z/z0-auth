# Console design guidelines

How the React console should look and behave. Use this when planning or building any module under `src/app/console/`.

## Principles

- **One question per screen.** Each page answers a single clear question (e.g. “Who is on the team?”, “How is this app set up?”).
- **Plain language.** Short labels, no jargon, no em-dashes in UI copy.
- **Reuse before inventing.** Compose from existing shell and CRUD components; match patterns already in Home, Apps, Team, and Profile.
- **shadcn first.** Raw primitives live in `components/ui/` (CLI only). See `.cursor/rules/shadcn-ui.mdc`.

## Information architecture

| Daily nav | Route | Purpose |
|-----------|-------|---------|
| Home | `/` | Overview metrics, next steps, recent activity |
| Apps | `/apps` | Register and manage applications |
| Team | `/team` | Members and invites |

Everything else (Settings, Activity, account security, etc.) is reachable via **Search** (⌘K) or contextual links — not duplicated in the top bar.

Primary nav lives in the **org menu** (chevron next to the org name), not as inline header links.

## Shell and header

**File:** `components/shell/AppHeader.tsx`

Layout is a three-column grid on all breakpoints:

```
[ Org name ▼ + breadcrumbs ]   [ Search ]   [ Account ]
```

| Zone | Behaviour |
|------|-----------|
| **Org + menu** | Org name links home. Chevron opens dropdown: Home · Apps · Team (`OrgNavMenu`). |
| **Breadcrumbs** | Shown when the URL has context beyond home. Truncate; collapse with `…` dropdown when long (`HeaderBreadcrumbs`). On narrow screens, middle segments collapse earlier. |
| **Search** | Mobile: icon only. Desktop (`md+`): “Search or jump to…” bar. Opens the same dialog palette (`ConsoleSearch`). |
| **Account** | Avatar + menu (profile, settings, sign out). Always `shrink-0` — never pushed off-screen by breadcrumbs. |

Do not add a second row of nav links, hamburger sidebars, or full-width search bars that compete with the org name on mobile.

## Page patterns

Pick **one** pattern per module. Do not mix horizontal tab bars with section sidebars for the same entity.

### 1. Home / hub

- Metric cards in a **3-column grid** at all breakpoints (tighter padding on small screens).
- Bold numbers on metrics; status tokens like `Off` / `On` / `Test`, not sentences.
- “Next” as cards with one action each, not a row of bare buttons.

**Reference:** `modules/home/components/HomeView.tsx`

### 2. List page

- `ListPageHeader` — title + primary action on the right.
- `DataTable` for tabular data (search and column controls live **inside** the table card).
- Empty and error states via `EmptyState`, `PageError`, `ListPageSkeleton`.

**Reference:** `modules/apps/pages/AppsListPage.tsx`, `modules/members/pages/MembersListPage.tsx`

### 3. List with related views (same resource)

- Keep **horizontal** `ResourceTabs` only for tightly related lists on one list page (e.g. Team → Members | Invites).
- Do not use this for deep section navigation inside an entity.

**Reference:** `components/crud/ResourceTabs.tsx`

### 4. Entity workspace (multi-section detail)

For anything with several sections (app setup, profile, future settings sub-areas):

```
[ Avatar / title / subtitle / badges / actions ]

[ SectionSidebar ]   [ Section content (Outlet) ]
```

- **Desktop:** vertical sidebar (`md:flex-col`).
- **Mobile:** horizontal scroll strip (same component).
- Section links use `NavLink` with muted active state (`bg-muted`), not underline tabs.

**References:**

| Use case | Layout | Sidebar |
|----------|--------|---------|
| App sections | `AppWorkspaceLayout` | `AppSectionSidebar` → `SectionSidebar` |
| Your account | `ProfileLayout` | `SectionSidebar` with profile routes |

**Do not** use `PageTabBar` / horizontal `TabsList` for entity section nav. Use `SectionSidebar`.

### 5. Simple entity detail (single view)

- `EntityDetailLayout` **without** tabs — header block + content only.
- Use for member detail, app user detail, invite detail, etc.

**Reference:** `modules/members/pages/MemberDetailPage.tsx`

## Data tables

**File:** `components/crud/DataTable.tsx`

- Toolbar (search, columns) and pagination sit **inside** the table `Card`, not floating above it.
- Toolbar and column headers share a muted top band so controls feel attached to the table.

## Forms

- One purpose per form; labels above inputs (`FormField`).
- Follow Adam Silver’s form design: clear errors next to fields, intentional helper text, no bloated intros.
- Destructive actions use `ConfirmDialog`.

## Copy and tone

| Do | Don't |
|----|-------|
| “Set up email” | “Configure your SMTP integration —” |
| “No members yet” | “You haven't invited any team members yet.” |
| “Team” (section name) | “People” / “Members module” in UI labels |

Page titles match the user’s question: **Team**, **Apps**, **Home**, not internal module names.

## Responsive checklist

Before shipping a console page, verify at ~390px and ~1024px:

- [ ] Org name and account menu visible in header
- [ ] Search visible (icon on mobile, bar on desktop)
- [ ] Breadcrumbs truncate or collapse — they never hide search or profile
- [ ] Section nav uses `SectionSidebar` (scroll row on mobile, column on desktop)
- [ ] List metrics / cards do not collapse to a single column unless intentional

## Component map

| Need | Component | Path |
|------|-----------|------|
| Top shell | `AppShell`, `AppHeader` | `components/shell/` |
| Org / primary nav | `OrgNavMenu` | `components/shell/OrgNavMenu.tsx` |
| Global search | `ConsoleSearch` | `components/shell/ConsoleSearch.tsx` |
| Breadcrumbs | `HeaderBreadcrumbs` | `components/shell/HeaderBreadcrumbs.tsx` |
| Section sidebar | `SectionSidebar` | `components/layout/SectionSidebar.tsx` |
| App workspace shell | `AppWorkspaceLayout` | `components/apps/AppWorkspaceLayout.tsx` |
| List header | `ListPageHeader` | `components/crud/ListPageHeader.tsx` |
| Tables | `DataTable` | `components/crud/DataTable.tsx` |
| List sub-views | `ResourceTabs` | `components/crud/ResourceTabs.tsx` |
| Single detail header | `EntityDetailLayout` | `components/layout/EntityDetailLayout.tsx` |

## Adding a new module

1. Decide which **page pattern** above fits.
2. Add routes in `routes.tsx` and search entries in `config/navigation.ts` if the page should be discoverable.
3. Add breadcrumb segments in `lib/breadcrumbs.ts` when the page is not a top-level nav item.
4. Reuse `SectionSidebar` for multi-section areas; do not introduce a new tab style.
5. Run console e2e specs that touch navigation and the new paths.
