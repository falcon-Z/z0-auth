# RBAC (v1)

Console and tenant APIs use **permissions**; **roles** are fixed bundles assigned via `user_roles`.

## Scopes

| Scope | `user_roles.tenant_id` | Used for |
|-------|------------------------|----------|
| `platform` | `NULL` | Instance operators |
| `tenant` | Organization UUID | Org console |

OAuth **token scopes** (P3+) are separate from console RBAC.

## Platform roles

| Role | Permissions |
|------|-------------|
| `platform_admin` | All keys in `permissions` table (includes `tenants:create`, `platform:users:write`, …) |
| `platform_manager` | `platform:users:read`, `platform:tenants:read`, `platform:sessions:revoke` — **not** `tenants:create` or `platform:users:write` |

## Tenant roles

| Role | Permissions |
|------|-------------|
| `tenant_admin` | `tenants:read`, `users:read`, `users:invite`, `sessions:revoke` |
| `tenant_manager` | `tenants:read`, `users:read`, `users:invite`, `sessions:revoke` (no future `sso:manage` / `scopes:manage`) |
| `tenant_member` | `tenants:read` |

## Assignment rules

- **Invite / role change:** admins may assign any tenant role; managers may assign `tenant_member` or `tenant_manager` only.
- **Platform break-glass:** `platform:users:write` may assign any tenant role when provisioning an org without membership.
- **Last admin:** cannot remove or demote the sole `tenant_admin` in an organization.

## Session

`GET /api/auth/session` returns `permissions[]` for the active organization (platform + tenant keys). Console gates must use this list.
