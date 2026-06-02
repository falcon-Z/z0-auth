# Authorization model (pivot)

The previous internal platform RBAC model is deprecated.

## What is removed

- No platform roles in the IAM console.
- No tenant roles in the IAM console.
- No internal `scope` model for operator permissions.
- No role assignment workflow in console APIs.

## What remains

- Authentication and session security for account owner and app users.
- Application-facing authorization features as part of app contracts.
- OAuth scopes (where needed) are defined per app and validated per client configuration.

## Console access

- Instance is owner-operated for now.
- Any future delegated admin model will be designed as a separate module, not by reusing the old tenant/platform RBAC system.
