# Product

Self-hosted **identity and access management** for developers building apps (similar in role to Auth0 or Clerk).

## Who uses what

| Actor | Role |
|-------|------|
| **Owner / member** | Signs up, runs setup, uses the **console** to manage the instance, apps, and app users. |
| **Developer** | Registers **applications**, redirect URIs, credentials; integrates OAuth/OIDC. |
| **App user** | End user of a customer app; signs in via hosted `/auth` and OAuth redirect back to the app. |

## What we provide

- **Console** — React admin UI for instance setup, members, apps, scopes, app users, email settings, profile/security.
- **Hosted auth** — Server-rendered `/auth/*` for login, signup, invites, password reset.
- **Authorization server** — `/oauth/*` + token and OIDC endpoints (in progress; see Todoist M09–M10).
- **JSON API** — `/api/*` for the console and for server-side integration.

## Application integration

- **Browser / SPA apps** — Authorization code with **PKCE** (public client; no secret in the browser).
- **Server-side apps** — Confidential client (client secret); same code flow; secret only on the server.

One **platform instance** per deployment (single account owner). **No** internal multi-tenancy or platform RBAC.

## Stack

- **Backend:** Bun (`Bun.serve`, minimal dependencies), PostgreSQL.
- **Console:** React + shadcn.
- **Auth pages:** HTML + HTMX (not React).

## v1 scope (Todoist Auth project)

Shipped or in progress: instance setup, members, apps, credentials, scopes, app users (M05 Option B), SMTP, console modules for the above.

Planned for v1: app-user sign-in (M06), OAuth/OIDC (M09–M10), MFA, passkeys, magic links, audit, Docker self-host.

Post-v1 / TBD: enterprise SSO (SAML/OIDC broker), analytics, device flow.
