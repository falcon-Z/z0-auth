# Compatibility during Alpha

Z0Auth is in early development and has no legacy compatibility obligations. The approved Alpha requirements and requirements-gathering decisions define the target behavior. Existing behavior, APIs, schemas, tests, and documentation may be replaced completely when they deviate from that target.

This page defines what adopters can reasonably depend on during the Alpha stage.

## Prefer documented protocol interfaces

OAuth 2.0 and OpenID Connect are the primary application integration boundary.

When Z0Auth documents support for a protocol flow or contract, integrations should depend on that documented behavior rather than internal routes, database structures, implementation modules, or incidental response fields.

Project-specific administrative APIs and configuration may change more frequently while the product is still in Alpha.

## Breaking changes

Changes may affect configuration, administrative APIs, database schemas, deployment requirements, and application-facing behavior that has not reached a stable contract.

Breaking changes should be deliberate and documented. Approved Alpha behavior, security, and correctness take priority over preserving an existing interface.

The project does not currently promise long-term semantic-versioning stability.

## Persisted state and migrations

Changes to security-sensitive persisted state should use explicit migrations when that state can reasonably be preserved.

An upgrade must not silently reinterpret existing credentials, sessions, grants, identities, or other security state merely to avoid a migration.

When operator action is required, release documentation should identify what changed, what must be migrated or reconfigured, and what cannot be carried forward safely.

Migration `0043_account_domains` gives each existing application a separate Account Domain and each existing application user a distinct internal Account. Matching email addresses, including matches with console identities, do not merge accounts. Existing application-facing user IDs, passwords, lifecycle state, metadata, and security records are preserved.

The `app_users` database interface becomes a compatibility view. Account profile, password, and lifecycle fields are stored in `accounts`; application bindings and metadata remain in `app_account_bindings`. Direct database integrations that depend on `app_users` being a table must be updated. The migration is forward-only; recovery to an older binary requires restoring a compatible backup.

This migration establishes canonical persistence. Migration `0043` keeps legacy service groups in separate domains; `0045_shared_sso_account_domains` replaces their identity-linking semantics as described below. Providers without a recorded issuer retain a provider-specific legacy authority key until provider configuration is reconciled; their email attributes are not used as durable external identity keys.

Migration `0044_application_memberships` preserves each existing app-facing ID in `app_account_bindings` as a stable Application Subject and introduces optional `application_memberships` records. Legacy account suspension/deletion remains account state; migrated memberships begin active. Subject metadata stays application-local and survives membership removal.

The app-user API now reports `membershipStatus` (`active`, `disabled`, or `removed`) separately from `accountStatus` (`active`, `disabled`, `locked`, or `deleted`). `status` remains the effective application-access state. PATCH `membershipStatus` changes application access without changing account suspension, passwords, or profile. Removing membership uses `DELETE /api/v1/apps/{appId}/users/{userId}/membership`; explicit provisioning or rejoining an existing domain account uses `POST /api/v1/apps/{appId}/memberships` with `accountId`. Rejoining preserves `sub` and does not restore revoked sessions or tokens. Existing account lifecycle endpoints continue to change the Account across its domain and must not be used as membership removal.

The current hosted application login and grant flows require active application membership. Reserving a subject or authenticating an account does not create membership. Arbitrary metadata such as a role label confers no authority; reserved identity/security fields are rejected. This migration is forward-only, with a compatible backup required for rollback to an older binary.

## Shared SSO Account Domains (migration 0045)

A service group now owns one shared Account Domain. Assign empty applications before registering accounts. A new group enables shared session reuse by default. `ssoEnabled: false` disables session reuse while retaining the shared identity boundary. Groups expose `accountDomainId` and `boundaryLocked`; every application keeps independent subject, membership, metadata, and claim/consent authority. Shared Account passwords, passkeys, the existing single TOTP factor/recovery codes, and external issuer/subject links resolve across subjects in that domain. The target application still requires active membership and must enable the external provider it accepts. SSO preserves authentication timestamps and does not repeat already-satisfied MFA.

Joining a populated independent domain, leaving/moving a populated shared domain, and deleting a populated group return HTTP 409 with `ACCOUNT_DOMAIN_IMMUTABLE`. The first Account permanently fixes domain placement, including after final Account purge. This includes domains with Accounts but no membership in the application being moved. An empty independent app may join an existing shared domain. Replacing an unchanged app list remains valid. Removing an empty app gives it a new private domain. No SSO request automatically provisions membership; use the explicit membership API to grant access to an existing Account.

Pre-Alpha email-based `service_group_members` and `service_group_app_users` links are removed. Migration 0045 automatically retires old group associations for populated applications, leaving their Accounts in independent domains. Empty associated applications move into their group's shared domain. Matching emails and old links never become shared Account authority; independent Accounts, subjects, credentials, memberships, and metadata retain their identity. No operator retirement workflow is required. Populated identity consolidation remains outside Alpha.

The affected populated applications' sessions and human OAuth grants are revoked, unused authorization codes and consent challenges are consumed, and pending service-group MFA challenges are retired. Those applications require fresh authentication to their independent Accounts. Unrelated application grants, console authority, and browser brokers remain unaffected.

The migration runs atomically. Rollback to an older binary requires a compatible backup. The console explains placement restrictions and prevents removal/deletion of populated groups. Target apps receive profile claims only through their own protocol scope checks; source-app metadata and consent never become shared authority.

## Undocumented behavior is not a contract

Internal routes, tables, modules, incidental fields, and other undocumented implementation details may change without compatibility guarantees.

Material under `docs/archive/` is historical reference and must not be treated as an active contract.

## What this means for adopters

The current release stage is appropriate for evaluation, development, and integrations that can absorb breaking changes.

Before upgrading or depending on a project-specific interface, check the documentation and release notes for the version you are using. The [roadmap](alpha.md) describes planned release scope; it does not itself guarantee that a capability exists in every development build.

## Application/Client split (migration 0046)

The physical Application store remains `apps`; `oauth_clients` replaces `app_credentials`. Existing Client IDs, record IDs and protocol FK bindings are retained. Client class and redirects move off the Application. Existing clients become interactive; no old client is silently granted workload purpose. Old machine tokens and refresh authority are retired, refresh defaults off, and browser origins require explicit registration. Operators can create dedicated workload clients and explicitly enable refresh/browser origins where needed. Account Domains, Accounts, memberships, subjects, authenticators and sessions retain their ownership and identity.

Application creation now requires `initialClient`; responses return `client` instead of `credential`. The `/credentials` API is replaced by `/clients`, and client RBAC grants migrate to `apps.clients:*` while preserving role assignment. Applications no longer expose class/redirect fields or an active credential count; responses expose `minimumAssurance` and `activeClientCount`.


## Resource authority (migration 0047)

Migration `0047_oauth_resources` adds registered Resources, explicit client/Resource/scope ceilings, and independent protocol grants. Audience URIs are globally unique, immutable and permanently reserved after retirement. New clients have no Resource authority. Operators register API Resources in **Apps → Resources**, select scopes from the owning Application's vocabulary, then configure each Client's **Resource access**. Clients may be permitted to request Resources owned by another Application; that permission does not transfer identity, membership, or console authority.

Historical application-audience codes, consent transactions, access tokens and refresh state are retired. No Resource or permission is inferred from that state. Account Domains, Accounts, subjects, memberships, authenticators and browser/operator sessions remain intact. Operators must register Resources and explicit Client permissions; clients then begin new authorization using exactly one `resource` URI. Client Credentials also requires that URI. Code exchange and refresh inherit the frozen audience, and an optional resource indicator must match it. Multiple indicators are rejected. Scope reductions contract existing grants permanently; restoring configuration requires a new authorization to regain removed scopes.

Access tokens remain opaque in this implementation stage; introspection exposes the Resource audience and is restricted to the issuing Client. Resource servers must require their exact audience and required scopes. JWT access-token delivery is tracked separately in #116 and #120. This migration runs atomically, is idempotent, and does not assign any old token to a new audience. Rollback requires a compatible backup and binary.

The built-in upstream-token retrieval API requires audience `urn:z0:federation-tokens:<application UUID>` for bearer callers, in addition to `federation:token` and the existing subject/application checks. Operators explicitly register that Resource and permit the calling Client; a token for another API cannot call the retrieval API even when its scope has the same name. Console calls continue to use operator permissions.

Migration `0048_application_client_lifecycle` adds recoverable Application and
Client deletion, stored purge deadlines, one-use verification challenges and
permanent Client ID reservations. It preserves existing registrations, Account
Domain placement, disabled state and Resource permissions. `apps:delete` remains
separate from ordinary edit access; roles that already hold it also receive the
narrower `apps.clients:delete` permission because deleting an Application already
includes its children. Client editors do not implicitly gain deletion authority.

The lifecycle API requires explicit ID confirmation and fresh proof for each
Delete/Purge action. `REGISTRATION_DELETION_GRACE_DAYS` defaults to 30; zero makes
deleting irreversible. Permanent purge physically removes configuration and
scoped protocol/identity state. Shared SSO credentials and unrelated Applications
survive; purged Resource audiences and Client IDs remain reserved forever.

## SPA browser access (#99)

Client `browser_origins` storage from migration 0046 is retained; no new migration
or origin inference is needed. Preflight no longer accepts an origin registered
by a different Client. Browser integrations needing preflight must include one
matching `client_id` in the token/UserInfo URL. Existing no-Origin server calls
continue to authenticate through the form or HTTP Basic, and UserInfo through its
bearer token. Cross-origin calls outside the specific Client's registration are
rejected before token grant mutations. Update SPA integrations using the example
and register origins explicitly through Client management.


## Independent Client secrets (migration 0049)

Client verifiers move from `oauth_clients.client_secret_hash` into `client_secrets` without changing Client IDs, registrations, Resource permissions or token bindings. Existing confidential Client Argon2id verifiers remain usable unless already revoked; no plaintext is recovered and unknown historical creators/last-use times remain null. Public Clients acquire no secret. Newly generated credentials use a secret lookup UUID plus 256 random bits and a one-way digest.

The destructive `/clients/:clientId/rotate` API is replaced by `/clients/:clientId/secrets` (GET metadata, POST addition) and `/secrets/:secretId/revoke` (POST with explicit ordinary/compromised reason). Create a secret, deploy it, then revoke the old secret. Creating Application/Client registrations now includes initial `secret` metadata as well as the one-time `clientSecret` value; both are null for public Clients. Existing `apps.clients:rotate` grants authorize addition and `apps.clients:revoke` grants authorize individual revocation. Secret authentication for public Clients and mixed Basic/form authentication are rejected.
