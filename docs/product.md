# Product

Self-hosted **identity and access management** for developers building apps (similar in role to Auth0 or Clerk).

## Who uses what

| Actor | Role |
|-------|------|
| **Owner / member** | Signs up, runs setup, uses the **console** to manage the instance, apps, and app users. |
| **Developer** | Registers **applications**, redirect URIs, credentials; integrates OAuth/OIDC. |
| **App user** | End user of a customer app; signs in via hosted `/auth` and OAuth redirect back to the app. |

## What we provide

Self-hostable **Auth0 / Clerk** for your apps: you run the IAM instance; your apps redirect end users to us; users come back signed in.

- **Console** — React admin UI for instance setup, members, apps, credentials, scopes, app users, email settings, profile/security.
- **Hosted app auth** — Branded sign-in/sign-up pages your end users see (email + password today; Google, Apple, GitHub, Facebook, etc. per app when social connections ship).
- **Authorization server** — `/oauth/*` + token and OIDC endpoints (M09–M10): your app is the OAuth client; we are the identity provider.
- **JSON API** — `/api/*` for the console and server-side integration.

### End-user experience (target)

1. Your app sends the user to us (OAuth authorize URL with your `client_id`).
2. The user sees **your app’s hosted page** — sign up or sign in (email/password, and later “Continue with Google” / Apple / GitHub / Facebook when enabled for that app).
3. After success, we redirect back to **your app’s redirect URI** with an authorization code (or session, per integration).
4. Your app exchanges the code for tokens and treats the user as logged in.

Same email on two different apps = two separate accounts (isolated per app), unless you explicitly link identities later.

### Console vs app sign-in (two audiences)

| Who | What they see | After login |
|-----|---------------|-------------|
| **You / your team** | `/auth/login` (no app context) — manage this IAM instance | Console at `/` |
| **Your app’s users** | Hosted page with app context (`client_id`) — sign up or sign in **for that app** | Redirect to your app, logged in |

We use one `/auth/*` UI stack for both; **app context** (`client_id`) decides whether we authenticate an app user or a console operator.

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

**Shipped:** OAuth 2.1 authorization code flow with PKCE, consent (scope descriptions, branding, skip on repeat approval), opaque access tokens, refresh token rotation, token revocation, CORS for browser clients, and client credentials for machine-to-machine. OIDC discovery, JWKS, RS256 ID tokens, and userinfo. Default OIDC scopes on app create.

**Not yet shipped:** MFA, passkeys, audit, Docker self-host.

**Social connections** (Google, Apple, GitHub, Facebook, etc. per app — Clerk/Auth0-style): planned module after core hosted auth + OAuth ship; console Federation nav is placeholder until then.

Post-v1 / TBD: enterprise SSO (SAML/OIDC broker for workforce), analytics, device flow.
