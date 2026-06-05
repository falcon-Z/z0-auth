# z0-auth

Self-hosted **identity and access management** for developers: register applications, send end users through our hosted sign-in, and return them to your app with OAuth/OIDC—similar in role to Auth0 or Clerk. One Bun monolith serves the JSON API, hosted auth pages, authorization server, and React management console.

Product overview: [docs/product.md](docs/product.md). Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Structure

```txt
src/
  server.ts             # Bun.serve route composition
  api/                  # /api/* JSON routes
  web/auth/             # /auth/* server-rendered forms (+ HTMX)
  web/oauth/            # /oauth/* authorization flow routes
  app/console/          # React + shadcn console SPA
  lib/contracts/        # shared validation/types
```

## Commands

```bash
bun install
bun run db:reset
bun dev
```

Local setup (Postgres, env, console API helpers): [docs/development.md](docs/development.md).

Production / Docker / cloud hosting (database URL, encryption keys, checklist UI): [docs/deployment.md](docs/deployment.md).

## URL contract

- `/auth/*` server HTML auth pages
- `/oauth/*` authorization server browser flow
- `/api/*` JSON API for console + external apps
- `/` and deep links served by console SPA

API contracts, validation matrix, and OpenAPI specs: [docs/api/README.md](docs/api/README.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
