# z0-auth

Authentication server and management console built as a single Bun monolith.

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

## URL contract

- `/auth/*` server HTML auth pages
- `/oauth/*` authorization server browser flow
- `/api/*` JSON API for console + external apps
- `/` and deep links served by console SPA

API contracts, validation matrix, and OpenAPI specs: [docs/api/README.md](docs/api/README.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
