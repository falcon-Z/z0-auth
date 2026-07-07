# Deployment

z0-auth is designed to run **where you host it** — Cloud Run, Railway, Render, EC2, Kubernetes, or local Docker. You provide PostgreSQL and instance secrets; the app does not provision a database or encryption keys on your behalf.

The management console shows a **setup checklist** until `DATABASE_URL` works, migrations are applied, and instance keys are configured (production). After that, z0-auth either creates the first owner from bootstrap configuration or redirects you to `/auth/setup` for manual setup.

## Required configuration

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL 16+ connection string |
| `INSTANCE_DATA_KEY` | AES-256 key for encrypting SMTP password and other instance secrets (recommended for multi-replica; same on every pod) |
| `INSTANCE_TOKEN_PRIVATE_KEY` | Ed25519 private key for password-reset link signatures (production; same on every replica) |
| `INSTANCE_TOKEN_PUBLIC_KEY` | Matching public key |

Generate keys once per environment:

```bash
bun src/scripts/generate-instance-data-key.ts
bun src/scripts/generate-instance-token-keys.ts
```

In **development**, keys may be auto-created under `.data/instance-keys.json` when env vars are unset. A single production instance may also auto-generate keys on first start; use env vars or a shared keys file before scaling to multiple replicas.

Optional first-owner bootstrap:

| Variable | Purpose |
|----------|---------|
| `Z0_BOOTSTRAP_ORG_NAME` | Organization name stored on the instance |
| `Z0_BOOTSTRAP_ADMIN_NAME` | First owner display name |
| `Z0_BOOTSTRAP_ADMIN_EMAIL` | First owner email address |
| `Z0_BOOTSTRAP_ADMIN_PASSWORD` | First owner password |

If any `Z0_BOOTSTRAP_*` value is set, all four are required before automatic setup runs. z0-auth only uses these values while platform setup is incomplete; after the first owner exists, they are ignored.

Other optional settings: `INSTALL_TOKEN` (protects `POST /api/setup` and the `/auth/setup` form), `ALLOW_INCOMPLETE_SETUP` (bypass setup guard for maintenance), `PORT`, `BIND_ADDRESS`, `APP_NAME`. See `.env.example`.

## Fresh production sequence

1. **Provision PostgreSQL** and set `DATABASE_URL` on the app service.
2. **Apply schema** (required before platform setup):
   ```bash
   bun run db:migrate
   ```
   Run from a machine or job that can reach the database with the same `DATABASE_URL` the app uses.
3. **Set instance keys** in production (`INSTANCE_DATA_KEY`, token keypair). Restart the app if you change env vars.
4. **Choose first-owner setup**:
   - Set all four `Z0_BOOTSTRAP_*` variables before startup for fully automated setup, or
   - Leave them unset and create the owner in `/auth/setup`.
5. **Open the console root URL** — the checklist should turn green. If bootstrap configuration is complete, the first owner is created automatically; otherwise you are redirected to `/auth/setup`.
6. **Complete platform setup** if you are using the manual browser flow — organization name, your name, email, and password. If `INSTALL_TOKEN` is set, enter it on the setup form.
7. **Sign in** at `/auth/login` with the owner account.

For local development, use `bun run db:reset` instead of `db:migrate` when you want a clean database. See [development.md](./development.md).

## Docker (planned images)

We plan to publish:

1. **App only** — you run or attach Postgres separately (recommended for production).
2. **App + Postgres** — single-node trials and local Docker Compose-style setups.

Until images are published, build from this repository and pass env vars at runtime. Never bake secrets into the image.

**Planned:** run pending migrations automatically on container start (before accepting traffic). Not implemented yet — operators must run `bun run db:migrate` manually today.

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

- One Secret (or external secrets operator) with `DATABASE_URL`, `INSTANCE_DATA_KEY`, and token keys — **identical on every pod**.
- Do not use independent `.data/` volumes per pod.
- Run migrations via an init Job or your CI pipeline before rolling out new app pods.

See also `docs/api/security-contract.md` (instance keys section).

## API: deployment status

`GET /api/deploy/status` — no authentication; available before platform setup. Returns database connection, schema readiness, and key status for the console checklist.

## Planned automation

- **Auto-migrate on container start** — apply pending SQL migrations when the process boots (planned with Docker images).
- **Terraform / one-click deploy** — provision Postgres and secrets in your cloud account and wire env vars automatically (optional path for teams that do not want manual secret setup).
- **CI images** — versioned Docker tags for app-only and bundled Postgres.

## Rotating keys

- **Data key:** existing SMTP ciphertext cannot be decrypted with a new key; re-save email settings in the console after rotation.
- **Token keys:** outstanding password-reset links stop verifying; users can request a new reset.
