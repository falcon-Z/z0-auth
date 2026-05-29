# z0-auth API documentation

Spec-driven contracts for the JSON API, auth UI, and planned OAuth surface.

## Start here

| Document | Description |
|----------|-------------|
| [CONTRACTS.md](./CONTRACTS.md) | **How to add or change APIs** — errors, types, checklist |
| [validation-matrix.md](./validation-matrix.md) | Field rules, codes, HTTP status, UI behavior |
| [security-contract.md](./security-contract.md) | Sessions, CSRF, cookies, OAuth rules |
| [ui-flows.md](./ui-flows.md) | HTML redirects and setup/login flows |

## OpenAPI specs

| Spec | Status |
|------|--------|
| [references/common.openapi.yaml](./references/common.openapi.yaml) | Shared errors and security components |
| [references/health.openapi.yaml](./references/health.openapi.yaml) | Health probes |
| [references/setup.openapi.yaml](./references/setup.openapi.yaml) | Platform setup |
| [references/auth.openapi.yaml](./references/auth.openapi.yaml) | Session auth |
| [references/oauth.openapi.yaml](./references/oauth.openapi.yaml) | OAuth 2.1 (planned) |

TypeScript mirrors: `src/lib/contracts/`.

## Quick rules

1. New endpoint → update OpenAPI + validation matrix + integration test.  
2. New error code → `ErrorCodes`, `common.openapi.yaml` enum, matrix row.  
3. State-changing request → CSRF per [security-contract.md](./security-contract.md).  
4. Return errors via `problem()` only.

See also [ARCHITECTURE.md](../ARCHITECTURE.md) for routing and repo layout.
