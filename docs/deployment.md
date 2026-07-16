# Deployment

z0-auth is designed to run **where you host it** — Cloud Run, Railway, Render, EC2, Kubernetes, or local Docker. You provide PostgreSQL and instance secrets; the app does not provision a database or encryption keys on your behalf.

The management console shows a **setup checklist** until `DATABASE_URL` works, migrations are applied, and instance keys are configured (production). After that, z0-auth either creates the first owner from bootstrap configuration or redirects you to `/auth/setup` for manual setup.

## Required configuration

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL 16+ connection string |
| `PUBLIC_ORIGIN` | Public HTTPS origin used for OAuth/OIDC and emailed links |
| `INSTANCE_DATA_KEY_ID` | Stable identifier for the active data key, included with encrypted values |
| `INSTANCE_DATA_KEY` | AES-256 key for encrypting SMTP password and other instance secrets; same on every pod |
| `INSTANCE_TOKEN_KEY_ID` | Stable identifier for the active token signing key, included with signed reset tokens |
| `INSTANCE_TOKEN_PRIVATE_KEY` | Ed25519 private key for password-reset link signatures (production; same on every replica) |
| `INSTANCE_TOKEN_PUBLIC_KEY` | Matching public key |

Generate keys once per environment:

```bash
bun run generate-keys
```

In **development**, keys may be auto-created under `.data/instance-keys.json` when env vars are unset. In **production**, z0-auth fails startup when root keys are missing or incomplete. Do not rely on generated keys for production, even for a single container.

Optional first-owner bootstrap:

| Variable | Purpose |
|----------|---------|
| `Z0_BOOTSTRAP_ORG_NAME` | Organization name stored on the instance |
| `Z0_BOOTSTRAP_ADMIN_NAME` | First owner display name |
| `Z0_BOOTSTRAP_ADMIN_EMAIL` | First owner email address |
| `Z0_BOOTSTRAP_ADMIN_PASSWORD` | First owner password |

If any `Z0_BOOTSTRAP_*` value is set, all four are required before automatic setup runs. z0-auth only uses these values while platform setup is incomplete; after the first owner exists, they are ignored.

Other optional settings: `INSTALL_TOKEN` (protects `POST /api/setup` and the `/auth/setup` form), `ALLOW_INCOMPLETE_SETUP` (bypass setup guard for maintenance), `PORT`, `BIND_ADDRESS`, `APP_NAME`. See `.env.example`.

## Server setting rules

z0-auth checks settings before it starts listening. It stops with a non-zero exit code when a value is malformed, incomplete, or unsafe for production. The error names the setting but never prints passwords, tokens, keys, or connection strings.

| Setting | Rule and default |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production`; default `development` |
| `PORT` | Whole number from 1 to 65535; default 3000 |
| `BIND_ADDRESS` | Hostname or IP address without a scheme, path, or port; default `127.0.0.1` outside production and `0.0.0.0` in production |
| `APP_NAME` | 1 to 100 characters; default `z0-auth` |
| `DATABASE_URL` | `postgres://` or `postgresql://` URL; the direct server may start without it but will not be ready |
| `DATABASE_POOL_MAX` | Whole number from 1 to 100; default 10 |
| `TRUST_PROXY_HOPS` | Whole number from 0 to 32; default 0, which ignores `X-Forwarded-For` |
| `ALLOW_INCOMPLETE_SETUP` | Exactly `true` or `false`; default `false` |
| `INSTALL_TOKEN` | Optional, but it cannot be empty when set |
| `INSTANCE_KEYS_PATH` | Non-empty development/test file path; default `.data/instance-keys.json`; not a replacement for production keys |

Environment changes require a restart. `.env.example` lists the key, first-owner, and SMTP groups as well.

SMTP is optional. With no `SMTP_*` settings, operators may configure it later in the console. `SMTP_ENABLED=false` disables email. Any other supplied SMTP setting makes the environment the source of SMTP settings. `SMTP_ENABLED=true` or any partial SMTP group without both `SMTP_HOST` and `SMTP_FROM_ADDRESS` stops startup. `SMTP_PORT` must be from 1 to 65535, `SMTP_ENCRYPTION` must be `none`, `starttls`, or `tls`, and production does not allow `none`.

## Startup and health behavior

Direct startup and Docker startup handle database problems differently:

- Direct `bun dev` or a built server checks settings and keys first. If PostgreSQL is missing, unreachable, or waiting for migrations, the HTTP process stays live. The setup checklist and health endpoints explain the problem, but `/api/ready` returns 503.
- The Docker image runs `bun run db:migrate` before starting the HTTP server. A missing database, failed connection, or failed migration stops the container before the server starts.

The public endpoints return only safe status information:

| Endpoint | Meaning |
| --- | --- |
| `/api/live` | HTTP 200 means the process can answer. No dependency is checked. |
| `/api/health` | HTTP 200 with `healthy` or `degraded`. Use it to find problems, not to route traffic. |
| `/api/ready` | HTTP 200 means the server can handle traffic. HTTP 503 means the database, schema, keys, or server settings are not ready. |
| `/api/deploy/status` | The same safe checks plus key source and first-owner setup state for the console checklist. |

These responses do not include connection strings, database errors, secret values, private keys, or key-file paths. Startup logs show more help but follow the same rule.

## Fresh production sequence

1. **Provision PostgreSQL** and set `DATABASE_URL` on the app service.
2. **Apply schema** (required before platform setup):
   ```bash
   bun run db:migrate
   ```
   Run from a machine or job that can reach the database with the same `DATABASE_URL` the app uses.
3. **Set instance keys** in production (`INSTANCE_DATA_KEY_ID`, `INSTANCE_DATA_KEY`, `INSTANCE_TOKEN_KEY_ID`, and token keypair). Restart the app if you change env vars.
4. **Choose first-owner setup**:
   - Set all four `Z0_BOOTSTRAP_*` variables before startup for fully automated setup, or
   - Leave them unset and create the owner in `/auth/setup`.
5. **Open the console root URL** — the checklist should turn green. If bootstrap configuration is complete, the first owner is created automatically; otherwise you are redirected to `/auth/setup`.
6. **Complete platform setup** if you are using the manual browser flow — organization name, your name, email, and password. If `INSTALL_TOKEN` is set, enter it on the setup form.
7. **Sign in** at `/auth/login` with the owner account. Enable MFA under **Profile → Security** and save the recovery codes outside this server.

### Owner MFA recovery

Use recovery codes first. If the owner loses both the authenticator and every recovery code, an operator with direct host and database access can remove only the owner's MFA material:

```bash
bun run mfa:reset-owner --email owner@example.com \
  --confirm-email owner@example.com --revoke-all-sessions
```

The command requires the normalized owner email twice, verifies that it belongs to the instance owner, records `mfa.local_owner_reset`, and revokes all owner sessions and remembered browsers. It does not reset the password or enable a disabled/deleted account. Protect host and database access as a recovery authority and test this procedure before relying on it.

For local development, use `bun run db:reset` instead of `db:migrate` when you want a clean database. See [development.md](./development.md).

## Docker image

Build the standalone application image from a clean checkout:

```bash
docker build -t z0-auth .
```

The multi-stage image contains the built server/console and migration files, not the repository's `.env`, `.data`, tests, documentation, Git history, or development dependencies. It runs as the non-root `bun` user. On every start its entrypoint applies pending migrations under the existing PostgreSQL advisory lock, then starts the HTTP server. A database connection or migration failure exits the container before it accepts traffic.

For production, inject `DATABASE_URL`, `PUBLIC_ORIGIN`, and all instance-key variables at runtime. The image does not generate production keys and does not include a shell-expanded secret-file convention. Use your platform's secret-to-environment support:

```bash
docker run --rm -p 3000:3000 \
  -e DATABASE_URL \
  -e PUBLIC_ORIGIN \
  -e INSTANCE_DATA_KEY_ID \
  -e INSTANCE_DATA_KEY \
  -e INSTANCE_TOKEN_KEY_ID \
  -e INSTANCE_TOKEN_PRIVATE_KEY \
  -e INSTANCE_TOKEN_PUBLIC_KEY \
  z0-auth
```

The image health check calls `/api/ready`. Readiness requires a database connection, the current schema, usable instance keys, valid server settings, and valid SMTP environment settings when SMTP variables are supplied.

## Local/trial Compose stack

The repository Compose stack is a one-command local evaluation environment:

```bash
export Z0_AUTH_DB_AUTH="$(openssl rand -hex 32)"
docker compose up --build -d --wait
docker compose logs -f app
```

Open `http://127.0.0.1:3000`. Set `Z0_AUTH_PORT` if port 3000 is occupied, for example `Z0_AUTH_PORT=3010 docker compose up --build -d --wait`.

Compose keeps PostgreSQL data and generated development instance keys in separate named volumes. Container recreation and `docker compose down` retain both. To intentionally erase the entire trial instance:

```bash
docker compose down --volumes
```

The stack binds only to loopback, does not publish PostgreSQL, and runs z0-auth in development mode so an HTTP localhost origin is valid. It requires `Z0_AUTH_DB_AUTH`; generate or choose that value outside Git and keep it available in the shell used for Compose commands. It is not a production deployment template: do not expose it to a network or copy its development-mode/key-generation behavior into production.

Published registry images are not part of this module. Until release automation ships, operators build and tag the standalone image from the source revision they intend to deploy.

Maintainers can run the isolated image/Compose verification with `bun run test:docker`. It uses temporary project-scoped volumes and removes them on exit.

## Hosting notes

### Google Cloud Run + Cloud SQL

- Create Cloud SQL for PostgreSQL in the same region.
- Connect via Cloud SQL connector (Unix socket in `DATABASE_URL`) or private IP.
- Store `DATABASE_URL` and instance keys in **Secret Manager**; mount as env secrets on the Cloud Run service.
- Run migrations from Cloud Build, a one-off Cloud Run job, or your laptop against the same `DATABASE_URL`.
- Redeploy after changing secrets; the console checklist auto-refreshes.

### Railway / Render

- Add a managed PostgreSQL service; copy its URL to `DATABASE_URL` on the web service.
- Add instance key variables from the generate scripts; redeploy.
- Run `bun run db:migrate` in a deploy hook or locally against the service URL.

### AWS EC2 / ECS

- Use RDS or self-managed Postgres; restrict security groups to the app.
- Inject secrets via SSM, Secrets Manager, or task definition secrets — not AMIs.
- Apply migrations before or during each release.

### Kubernetes

- One Secret (or external secrets operator) with `DATABASE_URL`, `INSTANCE_DATA_KEY_ID`, `INSTANCE_DATA_KEY`, `INSTANCE_TOKEN_KEY_ID`, and token keys — **identical on every pod**.
- Do not use independent `.data/` volumes per pod.
- Run migrations via an init Job or your CI pipeline before rolling out new app pods.

See also `docs/api/security-contract.md` (instance keys section).

## API: deployment status

`GET /api/deploy/status` — no authentication; available before platform setup. Returns database connection, schema readiness, and key status for the console checklist.

## Planned automation

- **Terraform / one-click deploy** — provision Postgres and secrets in your cloud account and wire env vars automatically (optional path for teams that do not want manual secret setup).
- **CI images** — publish versioned application-image tags with release provenance.

## Rotating keys

- **Data keys:** encrypted values carry a key ID. A future rotation flow will add a new active data key, keep older keys available for decryption, re-encrypt stored values, then retire old keys.
- **Token keys:** reset tokens carry a signing key ID. A future rotation flow will sign new tokens with the active key and keep previous public keys available for verification until outstanding tokens expire.
- Until the key-ring rotation workflow ships, treat root-key changes as a maintenance event and avoid changing production key material unless you are prepared to reconfigure encrypted settings and invalidate outstanding reset links.
