# API contract guide

How z0-auth defines and evolves HTTP contracts. Follow this for **every new module** (API, UI, OAuth, console).

---

## Layered sources of truth

| Layer | Location | Purpose |
|-------|----------|---------|
| Types + codes | `src/lib/contracts/` | TypeScript types, `ErrorCodes`, validation helpers |
| Runtime errors | `createProblemDetail()` / `problem()` | Uniform JSON error bodies with `requestId` |
| OpenAPI | `docs/api/references/*.openapi.yaml` | Human + tool-readable endpoint contracts |
| Validation matrix | `docs/api/validation-matrix.md` | Field rules, codes, status, UI behavior |
| Security | `docs/api/security-contract.md` | CSRF, sessions, OAuth rules |
| UI flows | `docs/api/ui-flows.md` | Redirects and HTML vs JSON parity |
| Tests | `tests/integration/` | Executable contract checks |

**Order of work for a new feature:** agree matrix row → update OpenAPI → implement using `ErrorCodes` → add integration test → ship UI aligned with matrix.

---

## Error response shape

All JSON errors use **Problem Detail** (RFC 7807-inspired):

```json
{
  "type": "about:blank",
  "title": "Validation Error",
  "status": 400,
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "detail": "Invalid setup request",
  "errors": [
    { "field": "email", "code": "invalid_email", "message": "Invalid email address" }
  ]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `type` | yes | Always `about:blank` for now |
| `title` | yes | Short category |
| `status` | yes | Duplicates HTTP status |
| `requestId` | yes | UUID for log correlation |
| `detail` | no | Longer explanation |
| `errors` | no | Field-level issues |
| `code` | no | Top-level when no `errors` (e.g. `SetupRequired`) |
| `retryAfter` | no | Rate limits (seconds) |

**Do not** invent ad-hoc error JSON shapes. **Do not** add codes without updating `ErrorCodes`, `common.openapi.yaml` enum, and the validation matrix.

---

## Synthetic error fields

Use underscore-prefixed fields for non-input failures:

| Field | Use |
|-------|-----|
| `_auth` | Invalid credentials (avoid email enumeration) |
| `_csrf` | CSRF / origin failure |
| `_rate` | Rate limiting |
| `_setup` | Setup state conflicts |
| `_install` | Install token failures |
| `_reset` | Password reset unavailable |

---

## Adding a new JSON endpoint

1. **OpenAPI** — Add path to the domain file (or create `docs/api/references/<module>.openapi.yaml`). `$ref` shared components from `common.openapi.yaml`.
2. **Types** — Add request/response types under `src/lib/contracts/<module>.ts`.
3. **Validation** — Reuse `validateEmail`, `validateRequiredString`, etc.; add module-specific validators if needed.
4. **Matrix** — Document each input rule in `validation-matrix.md`.
5. **Security** — CSRF on mutations; session or token auth; setup guard if applicable.
6. **Tests** — `tests/integration/<module>-validation.test.ts` at minimum for 400/403/401 cases.
7. **UI** — Map `errors[].field` to form fields; use generic messages for `_auth`.

---

## Adding UI-only behavior

- Document redirects and status codes in `ui-flows.md`.
- HTML forms: `_csrf` hidden field, same validation messages as API where fields overlap.
- Guard tests in `tests/integration/web-flow.test.ts` / `ui-contract.test.ts`.

---

## OAuth and OIDC APIs

- `oauth.openapi.yaml` documents the shipped authorization, token, refresh, revocation, introspection, discovery, JWKS, and userinfo endpoints.
- OAuth protocol errors use OAuth response bodies or trusted redirect URIs rather than generic API problems where the standards require them.
- Opaque access tokens are validated by confidential resource servers through RFC 7662 introspection.

---

## OpenAPI file index

| File | Scope |
|------|--------|
| `common.openapi.yaml` | Shared schemas, responses, security schemes |
| `health.openapi.yaml` | `/api/health`, `/api/live`, `/api/ready`, `/api/deploy/status` |
| `setup.openapi.yaml` | `/api/setup/*` |
| `auth.openapi.yaml` | `/api/auth/*` |
| `audit.openapi.yaml` | `/api/v1/audit-events` (P7M1) |
| `sessions.openapi.yaml` | Console self-service sessions (`/api/v1/sessions`) |
| `app-users.openapi.yaml` | App users + admin session list/revoke (P7M2) |
| `oauth.openapi.yaml` | OAuth/OIDC authorization server |

External references use relative paths, e.g. `$ref: "common.openapi.yaml#/components/responses/ValidationError"`.

`bun run quality:alpha` parses every OpenAPI document, requires unique operation IDs, resolves local file and JSON Pointer references, and checks the alpha-critical endpoint inventory. Run it before merging contract changes.

## Application subjects and memberships

An app-facing `userId` is the stable application subject, distinct from the internal Account ID. Subjects and their metadata survive membership removal. Membership is application-local; account suspension, credentials, recovery and profile belong to the Account Domain. Responses expose `membershipStatus`, `accountStatus`, and effective `status` separately. Operator detail responses include `accountId` and `accountDomainId` for explicit membership provisioning; these references are never used as the application-facing `sub`.

`PATCH /api/v1/apps/{appId}/users/{userId}` accepts membership `active` or `disabled` without mutating account security state. `DELETE /api/v1/apps/{appId}/users/{userId}/membership` removes membership and revokes that application's renewable authority. `POST /api/v1/apps/{appId}/memberships` explicitly provisions/rejoins an existing Account in the same domain; it reuses the same subject. These operations require console `apps.users:manage` permission and CSRF protection. Account lifecycle routes remain domain-wide operations. Authentication/subject reservation alone never enrolls an account.

Application metadata is opaque context stored under the subject. It cannot change Z0Auth authorization or overwrite reserved identity/security fields (`sub`, `accountId`, `accountDomainId`, `appId`, `userId`, `membershipStatus`, `status`, and JavaScript prototype fields).

## Applications and child OAuth Clients

Applications own display metadata, minimum assurance, scopes, membership and stable subjects. Create an Application with `{name, minimumAssurance?, initialClient: {label, clientType, purpose, redirectUris?, browserOrigins?, refreshEnabled?, assuranceOverride?}}`. The response contains `app`, `client`, and a one-time `clientSecret` (null for public clients). Multiple Clients of the same Application deliver the same application-facing subject.

Manage children at `/api/v1/apps/:appId/clients` (GET/POST), `…/:clientId` (PATCH), and `…/:clientId/rotate` (POST). Here `clientId` is the record UUID; `client.clientId` is the stable protocol identifier. Reads use `apps.clients:read`; create/update/rotate use their matching scopes and retain CSRF and privileged verification. Class, purpose and identity are immutable, including through database writes. Human and workload purposes cannot be mixed. Interactive clients require redirects; workload clients must be confidential without human redirect, refresh or assurance configuration.

`assuranceOverride: null` inherits the Application minimum. A Client may require stronger assurance; weaker overrides are rejected. Raising the parent minimum removes explicit baseline overrides so they inherit strong. Strong authorization requires an existing session with verified MFA/passkey proof; JIT enrollment and the complete assurance experience are tracked separately in #105. Codes and refresh tokens retain issuance assurance so policy strengthening blocks weaker existing authority.

Browser origins are registered independently for public interactive Clients. Refresh capability defaults to false and must be enabled explicitly. Disabling refresh revokes existing families and cached retry results. Disabling a Client contains its renewable authority; disabling the Application contains every child. Re-enabling permits new use without reviving revoked grants. Pending deletion and permanent purge transitions are tracked in #98; multiple concurrent secrets are tracked in #100.

Acceptance evidence: `tests/integration/apps-flow.test.ts` proves shared subjects/membership, immutable class/purpose, management RBAC/CSRF, assurance enforcement, and concurrent containment. `tests/integration/oauth-clients-migration.test.ts` proves preservation of identity and operator grants during upgrade. `tests/e2e/oauth-clients-console.spec.ts` exercises server, SPA, and workload Client creation and management. The backend evidence is included in `bun run quality:alpha`.
