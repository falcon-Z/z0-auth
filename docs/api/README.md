# z0-auth API documentation

Spec-driven contracts for the single-account IAM model. Product context: [../product.md](../product.md).

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
| [references/health.openapi.yaml](./references/health.openapi.yaml) | Health checks and safe deployment status |
| [references/setup.openapi.yaml](./references/setup.openapi.yaml) | Instance setup |
| [references/auth.openapi.yaml](./references/auth.openapi.yaml) | Login, session, password reset |
| [references/members & invites](./references/invites.openapi.yaml) | Instance members and invites (M01) |
| [references/applications](./references/apps.openapi.yaml) | Applications, credentials (M03), scopes (M04) |
| [references/settings](./references/settings.openapi.yaml) | SMTP and email settings (M08) |
| [references/console.openapi.yaml](./references/console.openapi.yaml) | Dashboard summary |
| [references/app-users.openapi.yaml](./references/app-users.openapi.yaml) | App end users per application (M05) |
| [references/sessions.openapi.yaml](./references/sessions.openapi.yaml) | Session management |
| [references/oauth.openapi.yaml](./references/oauth.openapi.yaml) | OAuth 2.1 and OIDC |

TypeScript mirrors: `src/lib/contracts/`.

## Quick rules

1. New endpoint → update OpenAPI + validation matrix + integration test.  
2. New error code → `ErrorCodes`, `common.openapi.yaml` enum, matrix row.  
3. State-changing request → CSRF per [security-contract.md](./security-contract.md).  
4. Return errors via `problem()` only.

See also [ARCHITECTURE.md](../ARCHITECTURE.md) for routing and repo layout.
