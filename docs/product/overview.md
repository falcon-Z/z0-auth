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
- **Hosted app auth** — Branded sign-in/sign-up pages with email/password and social providers (Google, Apple, GitHub, Facebook) when enabled per app.
- **Authorization server** — `/oauth/*` + token and OIDC endpoints (M09–M10): your app is the OAuth client; we are the identity provider.
- **JSON API** — `/api/*` for the console and server-side integration.
- **Multi-factor authentication** — authenticator-app TOTP, recovery codes, remembered browsers, sensitive-action rechecks, and controlled reset for console members and app users.

### End-user experience (target)

1. Your app sends the user to us (OAuth authorize URL with your `client_id`).
2. The user sees **your app’s hosted page** — sign up or sign in with email/password or enabled social providers.
3. After success, we redirect back to **your app’s redirect URI** with an authorization code (or session, per integration).
4. Your app exchanges the code for tokens and treats the user as logged in.

Same email on two different apps = two separate accounts (isolated per app), unless both apps belong to an SSO-enabled **app group** (see grouped services).

### Console vs app sign-in (two audiences)

| Who | What they see | After login |
|-----|---------------|-------------|
| **You / your team** | `/auth/login` (no app context) — manage this IAM instance | Console at `/` |
| **Your app’s users** | Hosted page with app context (`client_id`) — sign up or sign in **for that app** | Redirect to your app, logged in |

We use one `/auth/*` UI stack for both; **app context** (`client_id`) decides whether we authenticate an app user or a console operator.

## Application integration

- **Browser / SPA apps** — Authorization code with **PKCE** (public client; no secret in the browser).
- **Server-side apps** — Confidential client (client secret); same code flow; secret only on the server.

One **platform instance** per deployment. There is no internal multi-tenant organization boundary; console access within the instance is controlled by built-in or custom roles and platform scopes.

## Stack

- **Backend:** Bun (`Bun.serve`, minimal dependencies), PostgreSQL.
- **Console:** React + shadcn.
- **Auth pages:** HTML + HTMX (not React).
