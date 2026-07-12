# z0-auth

z0-auth is a self-hosted authentication server and IAM service for teams that want to run their own identity layer. It provides a management console, hosted sign-in pages for application users, OAuth 2.1 and OIDC endpoints, app-user management, external identity provider configuration, SMTP-backed email flows, audit logs, and session management.

The service runs as one Bun and TypeScript application backed by PostgreSQL. The same process serves the JSON API, hosted auth pages, OAuth/OIDC routes, and the React management console.

## Who this is for

| Audience | What you do |
|----------|-------------|
| Operators | Deploy z0-auth, configure PostgreSQL and secrets, complete first-time setup, configure SMTP, and maintain the instance. |
| App developers | Register applications, configure redirect URIs and scopes, send users through hosted sign-in, and exchange OAuth codes for tokens. |
| Console members | Manage apps, credentials, app users, roles, settings, sessions, and audit activity through the console. |
| App users | Sign in to customer applications through the hosted `/auth` pages. They do not use the management console. |

## Current alpha status

The repository is under active alpha development. Publicly documented behavior is maintained in the product, API, deployment, and development documentation linked below.

## Repository layout

```txt
src/
  server.ts             # Bun.serve route composition
  api/                  # /api/* JSON routes and domain handlers
  web/auth/             # /auth/* hosted HTML auth pages
  web/oauth/            # /oauth/* browser OAuth routes
  app/console/          # React management console
  lib/contracts/        # shared validation and TypeScript contracts
docs/
  api/                  # API contracts, validation, security, and OpenAPI specs
  deployment.md         # operator deployment notes
  development.md        # local development setup
examples/
  oauth-spa/            # public client PKCE sample
  oauth-server/         # confidential client sample
```

## Local setup

Prerequisites:

- Bun 1.3 or newer.
- PostgreSQL 16 or newer. Docker is fine for local development.

Install dependencies and create local environment files:

```bash
cp .env.example .env
cp .env.example .env.test
bun install
```

Start PostgreSQL locally if you do not already have one:

```bash
docker run -d --name z0-auth-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=z0auth \
  -p 5432:5432 postgres:16
```

Apply the schema:

```bash
bun run db:reset
```

Run the app:

```bash
bun dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). If the database, migrations, or required keys are not ready, the console shows a setup checklist before the owner setup screen.

For the full local development workflow, including the isolated test database, see [docs/development.md](docs/development.md).

## Production deployment

z0-auth expects you to provide PostgreSQL and instance secrets. Published Docker images are not available yet, so production deployments currently build and run the Bun app from this repository.

Production configuration:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string. Required for a usable instance. |
| `PUBLIC_ORIGIN` | Canonical HTTPS origin used for OAuth/OIDC issuer, callbacks, and emailed security links. Required in production. |
| `DATABASE_POOL_MAX` | PostgreSQL pool limit per Bun process. Defaults to 10. |
| `TRUST_PROXY_HOPS` | Number of trusted reverse proxies that append `X-Forwarded-For`. Defaults to 0, which ignores the header. |
| `INSTANCE_DATA_KEY_ID` | Stable identifier stored with values encrypted by the active data key. Required in production. |
| `INSTANCE_DATA_KEY` | Stable AES-256 key used to encrypt SMTP passwords, provider secrets, OIDC signing keys, and upstream provider tokens. Required in production. |
| `INSTANCE_TOKEN_KEY_ID` | Stable identifier stored in signed internal tokens. Required in production. |
| `INSTANCE_TOKEN_PRIVATE_KEY` | Ed25519 private key used for password-reset link signatures. Required with `INSTANCE_TOKEN_PUBLIC_KEY` when token keys are provided through the environment. |
| `INSTANCE_TOKEN_PUBLIC_KEY` | Matching Ed25519 public key. Required with `INSTANCE_TOKEN_PRIVATE_KEY` when token keys are provided through the environment. |
| `INSTALL_TOKEN` | Optional token required during first-time setup. Recommended for internet-facing deployments. |

Generate instance keys once per environment and store the complete output in deployment secrets:

```bash
bun run generate-keys
```

Apply migrations before accepting traffic:

```bash
bun run db:migrate
```

Build and start:

```bash
bun run build
bun start
```

For platform-specific notes for Cloud Run, Railway, Render, AWS, and Kubernetes, see [docs/deployment.md](docs/deployment.md).

## First-time setup and super admin

The first console account is created through the setup flow. This account is the owner of the instance.

1. Deploy or start the app with `DATABASE_URL` configured.
2. Run `bun run db:migrate`.
3. Configure stable instance keys in production.
4. Open the console root URL.
5. Follow the checklist until it redirects to `/auth/setup`.
6. Enter the organization name, owner name, owner email, and password.
7. If `INSTALL_TOKEN` is configured, enter that token on the setup form.
8. After setup, sign in at `/auth/login`.

Setup does not print or store a reusable admin password outside the database. Choose and record the owner credentials in your own password manager.

The JSON setup API is also available:

- `GET /api/setup/status` returns setup and migration readiness.
- `POST /api/setup` completes owner setup. It requires CSRF and, when configured, `X-Install-Token`.

For most operators, the browser setup flow is the recommended path.

## SMTP and email

SMTP is used for password reset emails, invite flows, and transactional messages. You can configure it in two ways:

| Method | Use when |
|--------|----------|
| Environment variables | You want deployment-controlled SMTP settings that override console settings. |
| Console settings | You want operators to manage SMTP from the UI after setup. |

Relevant environment variables:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_ENCRYPTION`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM_ADDRESS`
- `SMTP_FROM_NAME`
- `SMTP_ENABLED`

If any SMTP setting is supplied through the environment, the environment is authoritative and partial configuration fails readiness rather than silently falling back to database settings. `SMTP_ENABLED=false` is the deliberate exception: it disables delivery without requiring any other SMTP setting. `SMTP_PASSWORD` is required only when `SMTP_USERNAME` is set, so trusted unauthenticated relays remain supported.

The console includes an email settings screen and a test-email action. SMTP passwords stored through the console are encrypted with `INSTANCE_DATA_KEY`, so back up that key before relying on the instance for email recovery.

## Register an application

Use the console unless you are building automation against the API.

1. Sign in to the console.
2. Open **Apps**.
3. Create an app.
4. Choose a client type:
   - `public` for browser or mobile clients. These clients use PKCE and do not receive a client secret.
   - `confidential` for server-side apps. These clients receive a one-time client secret.
5. Add one or more exact redirect URIs.
6. Save the generated `client_id`. For confidential apps, save the one-time `client_secret`.
7. Register any application-specific scopes your app will request.
8. Configure hosted sign-in options, external providers, and app-group membership if needed.

The application API is documented in [docs/api/references/apps.openapi.yaml](docs/api/references/apps.openapi.yaml). The main routes are:

- `GET /api/v1/apps`
- `POST /api/v1/apps`
- `GET /api/v1/apps/{appId}`
- `PATCH /api/v1/apps/{appId}`
- `POST /api/v1/apps/{appId}/credentials`
- `POST /api/v1/apps/{appId}/credentials/{credentialId}/rotate`
- `GET /api/v1/apps/{appId}/scopes`
- `POST /api/v1/apps/{appId}/scopes`

Console API mutations use the existing session cookie and CSRF header. Do not call these endpoints directly from an untrusted browser outside the console.

## Authenticate app users

z0-auth acts as the authorization server. Your app redirects the user to z0-auth, the user signs in on the hosted page, and z0-auth redirects back to your registered redirect URI with an authorization code.

### Public clients with PKCE

Use this flow for SPAs and other clients that cannot keep a secret.

1. Generate a `code_verifier`.
2. Derive a S256 `code_challenge`.
3. Redirect the browser to `/oauth/authorize`.
4. Receive `code` and `state` on your redirect URI.
5. Exchange the code at `/oauth/token` with the original `code_verifier`.
6. Use the returned access token, optional refresh token, and optional ID token.

Authorize URL:

```txt
https://auth.example.com/oauth/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback&scope=openid%20profile%20email&state=RANDOM_STATE&code_challenge=CODE_CHALLENGE&code_challenge_method=S256
```

Token exchange:

```bash
curl -X POST https://auth.example.com/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=authorization_code' \
  -d 'client_id=YOUR_CLIENT_ID' \
  -d 'redirect_uri=https://app.example.com/callback' \
  -d 'code=AUTHORIZATION_CODE' \
  -d 'code_verifier=ORIGINAL_CODE_VERIFIER'
```

See [examples/oauth-spa](examples/oauth-spa) for a minimal browser sample.

### Confidential server clients

Use this flow for server-rendered apps and backend services that can keep a client secret.

```bash
curl -X POST https://auth.example.com/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=authorization_code' \
  -d 'code=AUTHORIZATION_CODE' \
  -d 'redirect_uri=https://app.example.com/callback' \
  -d 'client_id=YOUR_CLIENT_ID' \
  -d 'client_secret=YOUR_CLIENT_SECRET'
```

See [examples/oauth-server](examples/oauth-server) for the server-side flow.

### Refresh tokens

Authorization code exchange returns a refresh token when applicable. Refresh tokens rotate on every use.

```bash
curl -X POST https://auth.example.com/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=refresh_token' \
  -d 'refresh_token=REFRESH_TOKEN' \
  -d 'client_id=YOUR_CLIENT_ID' \
  -d 'client_secret=YOUR_CLIENT_SECRET'
```

For public clients, omit `client_secret`.

### Userinfo

Call userinfo with a bearer access token:

```bash
curl https://auth.example.com/oauth/userinfo \
  -H 'Authorization: Bearer ACCESS_TOKEN'
```

OIDC discovery and keys are available at:

- `GET /.well-known/openid-configuration`
- `GET /.well-known/jwks.json`

### Machine-to-machine tokens

Confidential clients can request app-scoped access tokens without a user:

```bash
curl -X POST https://auth.example.com/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials' \
  -d 'client_id=YOUR_CLIENT_ID' \
  -d 'client_secret=YOUR_CLIENT_SECRET' \
  -d 'scope=read:orders'
```

Requested scopes must be registered on the app.

## App users, providers, and app groups

App users are isolated per application. The same email address in two unrelated apps represents two separate app-user records.

Available console and API capabilities include:

- Create, invite, list, update, and inspect app users.
- List and revoke app-user sessions.
- Configure instance-level external identity providers.
- Enable selected providers per app.
- Retrieve or refresh upstream provider tokens from app backends when the app has the `federation:token` scope.
- Group related apps and enable shared sign-in across those apps.

Relevant API specs:

- [App users](docs/api/references/app-users.openapi.yaml)
- [Federation providers](docs/api/references/federation.openapi.yaml)
- [App groups](docs/api/references/service-groups.openapi.yaml)
- [Sessions](docs/api/references/sessions.openapi.yaml)

Customer resource servers validate opaque access tokens through `POST /oauth/introspect`, authenticating with the app's confidential client credentials. Confidential clients may use HTTP Basic authentication; public clients continue to use PKCE and do not receive secrets.

## Operational endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Composite service health, including database status. |
| `GET /api/live` | Liveness probe. Does not check dependencies. |
| `GET /api/ready` | Readiness probe. Requires dependencies needed to serve traffic. |
| `GET /api/deploy/status` | Deployment checklist data for database, schema, and instance keys. |
| `GET /api/setup/status` | First-time setup status. |

## Commands

| Command | Purpose |
|---------|---------|
| `bun install` | Install dependencies. |
| `bun dev` | Run the development server with hot reload. |
| `bun run build` | Build production assets. |
| `bun run db:migrate` | Apply pending migrations without wiping data. |
| `bun run db:reset` | Reset the local database and apply schema. Destructive. |
| `bun run db:test:init` | Create the isolated test database. |
| `bun test --preload ./tests/preload.ts --max-concurrency=1 --parallel=1 tests/unit tests/integration tests/api` | Run unit, integration, and API tests serially against the shared test database. |
| `bun run test:e2e` | Run Playwright end-to-end tests. |

## Documentation map

- [Product overview](docs/product.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/deployment.md)
- [Local development](docs/development.md)
- [Data model](docs/data-model.md)
- [API documentation](docs/api/README.md)
- [API contracts](docs/api/CONTRACTS.md)
- [Validation matrix](docs/api/validation-matrix.md)
- [Security contract](docs/api/security-contract.md)
- [UI flow contract](docs/api/ui-flows.md)
- [Documentation style guide](docs/documentation-guidelines.md)

## License

Apache License 2.0. See [LICENSE](LICENSE).
