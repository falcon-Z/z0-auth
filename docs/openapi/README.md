# OpenAPI specifications

OpenAPI 3.1 YAML files in this tree **mirror** the API source layout under `api/src/`.

## Path mapping

| API source | OpenAPI spec |
|------------|----------------|
| `api/src/auth/login.ts` | `docs/openapi/auth/login.openapi.yaml` |
| `api/src/v1/admin/tenants/` | `docs/openapi/v1/admin/tenants/tenants.openapi.yaml` |
| `api/src/v1/me/sessions/` | `docs/openapi/v1/me/sessions/sessions.openapi.yaml` |
| `api/src/oauth2/token.ts` | `docs/openapi/oauth2/token.openapi.yaml` |

## Conventions

- Update the spec in the **same PR** as the handler.
- Reuse shared schemas from `_components/` (e.g. `problem.yaml` for RFC 7807 errors).
- Document security schemes: session cookie, Bearer (opaque token), API key, OAuth2 client credentials.
- Export full catalog: bundle `openapi.yaml` at this directory root (to be added when first resources land).

## Tooling

Import into Postman, Insomnia, or an API gateway. CI will lint specs and optionally diff for breaking changes.

See [GUIDELINES.md](../GUIDELINES.md) §14 and [ARCHITECTURE.md](../ARCHITECTURE.md) §14.
