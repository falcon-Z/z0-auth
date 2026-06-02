# Data model (single-account IAM pivot)

This document replaces the old tenant-first model. One z0-auth instance serves one account owner and their apps.

## Core product model

- The account owner signs up once with `name`, `email`, `password`, and `organizationName`.
- The account owner configures SMTP and other instance settings.
- The account owner creates apps and gets app credentials.
- App users authenticate through this service.
- The account owner manages app users from this console.

There is no internal multi-tenancy, no active-tenant switching, and no platform RBAC role/scope model.

## Terminology

| Term | Meaning |
|------|---------|
| instance | One deployed z0-auth service |
| account owner | The person who signed up and controls instance settings |
| organization | Profile metadata for the account owner account |
| app | A registered client application using this IAM service |
| app user | End user who signs in to an app through this IAM service |

## Locked decisions

| Topic | Decision |
|-------|----------|
| Account model | Single owner account per instance |
| Isolation | Separate customers run separate instances |
| Authorization inside console | Owner-only for now, no internal RBAC |
| OAuth scopes | Managed per app contract only, not via platform role/scope registry |
| Sessions | Session cookie tracks authenticated user identity only |

## Entity overview

| Table | Purpose |
|-------|---------|
| `users` | Person identity (owner + app users) |
| `password_credentials` | Password hashes for local auth |
| `sessions` | Session tokens, expiry, revocation, client metadata |
| `apps` | Registered applications, metadata, lifecycle status |
| `app_credentials` | Client IDs/secrets or key pairs linked to apps |
| `app_memberships` | Which app users belong to which app |
| `smtp_settings` | SMTP provider config for email flows |
| `instance_settings` | Global service settings |
| `audit_events` | Security and admin audit trail |

## Data boundaries

| Data | Scoped by |
|------|-----------|
| `users`, `password_credentials`, `sessions` | instance |
| `apps`, `app_credentials`, `app_memberships` | `app_id` |
| `audit_events` | instance, optional `app_id` |

## API implications

- Remove tenant-specific endpoints and payload fields (`tenant`, `tenantId`, org switch flows).
- Remove console RBAC endpoints and role assignment endpoints.
- Keep auth/session flows, but simplify responses to account + user context.
- Keep OAuth and authorization features as app-facing capabilities, not platform operator roles.

## Delivery sequence

1. Rewrite OpenAPI contracts for setup/auth/app management.
2. Rewrite validation matrix for single-account flows.
3. Refactor DB schema away from tenant tables.
4. Refactor backend handlers and integration tests.
5. Update console routes, labels, and state flows.

## Related docs

- [rbac.md](./rbac.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [api/security-contract.md](./api/security-contract.md)
