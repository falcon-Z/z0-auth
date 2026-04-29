# Z0 Auth Product Glossary and Language Guidelines

## Why This Exists

Z0 Auth already has a strong technical model, but product language can drift if each feature invents its own terms. This document defines the canonical product vocabulary for specs, API docs, UI copy, roadmap work, and engineering discussions.

Use this document when writing:

- product specs
- endpoint descriptions
- UI labels and help text
- milestone or issue descriptions
- onboarding and operator documentation

## Canonical Product Model

Z0 Auth is a self-hosted authentication platform with a four-level domain model:

1. Platform
2. Tenant
3. App
4. Identity

This hierarchy is both a product concept and a security boundary. Product language must preserve that meaning.

## Core Entity Definitions

### Platform

The platform is the full Z0 Auth deployment operated by the customer or operator.

- There is one platform per deployment in v1.
- The platform owns global configuration, bootstrap state, SMTP state, and platform admins.
- Platform language should be used for deployment-wide actions and control-plane operations.

Use when talking about:

- first-time setup
- deployment-wide settings
- platform admins
- global health and operations

Do not use platform to mean tenant.

### Tenant

Tenant is the canonical term for the primary customer boundary inside the platform.

- A tenant is the security, policy, and ownership boundary for a customer workspace.
- Tenants contain apps, identities, sessions, API keys, consent, and audit-scoped activity.
- Tenant is the term used in code, schema, auth claims, and internal APIs.

Use tenant when talking about:

- isolation boundaries
- admin permissions
- customer-owned apps and identities
- audit and compliance scoping

### Organization or Org

Organization or org is not the canonical system term.

- In product copy, org may be used as an optional explanatory alias only if user research shows tenant feels too infrastructure-heavy.
- In APIs, database schema, token claims, tests, and architecture docs, always use tenant.
- Do not mix org and tenant in the same flow without an explicit mapping statement.

Recommended rule:

- Canonical product and engineering term: tenant
- Optional UI-friendly label, if ever adopted: organization
- Mapping copy example: "Organization (tenant)"

Current recommendation for this repo: stay with tenant as the primary term everywhere until there is a deliberate UI-language decision.

### App

An app is a registered client or application that delegates authentication to Z0 Auth.

- Apps belong to exactly one tenant.
- Apps define redirect URIs, origins, client credentials, API keys, and auth-related configuration.
- App is the preferred product term; client may be used only in OAuth-specific protocol contexts.

Use app for:

- operator-facing docs
- management APIs
- product specs

Use client for:

- OAuth2 and OIDC protocol language
- client credentials and client authentication

Recommended phrasing:

- Product copy: app
- Protocol copy: OAuth client or client

### Identity

An identity is the end-user account record known to Z0 Auth for a specific app and tenant context.

- Identities authenticate, hold credentials, create sessions, and grant consent.
- Identity is broader and more correct than user in system design because it avoids implying a single human maps to a single account everywhere.

Use identity when talking about:

- records stored by the platform
- auth lifecycle
- sessions and credentials
- admin and audit operations

User may be used in explanatory or UI copy when the audience is clearly non-technical, but specs and APIs should prefer identity.

### Credential

A credential is a secret or proof used to authenticate an identity or app.

Examples:

- password
- TOTP secret
- app client secret
- API key secret material

Credential is the generic term. Use the specific credential type where possible.

### Session

A session is an authenticated continuity record for an identity using an app.

- Sessions back token issuance and revocation.
- Sessions are lifecycle objects, not just browser cookies.
- A session can outlive a single HTTP request and may span multiple tokens.

### API Key

An API key is a long-lived app-scoped credential used for server-to-server access.

- API keys are issued to an app.
- API keys carry scope and optional expiry.
- API keys are rotated or revoked, not edited in place.

### Bootstrap

Bootstrap is the one-time platform initialization process.

- Bootstrap creates the first platform record and first platform admin.
- Bootstrap is a setup operation, not an everyday admin workflow.
- Use bootstrap for deployment initialization only.

Do not use bootstrap to describe tenant or app provisioning.

## Actor and Role Language

Use actor for the entity performing an action in logs, specs, and authorization language.

Canonical actor types in the current system:

- platform admin
- tenant admin
- app operator
- identity
- system

Guideline:

- actor = who performed the action
- role = the level of authority granted to that actor

Do not use user when you specifically mean admin/operator/service actor.

## Action Vocabulary

Action names should reflect intent, ownership, and lifecycle state. Use the same verb in product specs, audit events, and docs wherever possible.

### Create

Use create when a new first-class resource is added to the system.

Examples:

- create tenant
- create app
- create identity
- create session

### Register

Use register when onboarding an app or identity into Z0 Auth in a way that emphasizes enrollment rather than generic creation.

Examples:

- register app
- register identity

Rule:

- Use create for CRUD/API semantics.
- Use register for onboarding flows and product narratives.

### Provision

Use provision for operator-driven setup of infrastructure-like resources or default state.

Examples:

- provision platform
- provision default tenant

Avoid provision for normal end-user actions.

### Invite

Use invite when one actor initiates access for another identity.

Examples:

- invite tenant admin
- invite operator

Do not use create when the user experience is explicitly invitation-based.

### Authenticate

Use authenticate when verifying credentials and establishing identity.

Examples:

- authenticate identity
- authenticate app using client credentials

### Authorize

Use authorize when deciding whether an authenticated actor can perform an action.

Examples:

- authorize tenant admin to create app
- authorize API key for requested scope

Authentication answers who you are. Authorization answers what you can do.

### Issue

Use issue for secrets or tokens generated by the platform and handed to an actor.

Examples:

- issue access token
- issue refresh token
- issue API key

### Rotate

Use rotate when replacing a still-valid secret with a new one in a controlled lifecycle flow.

Examples:

- rotate API key
- rotate refresh token

### Revoke

Use revoke when invalidating access before natural expiry.

Examples:

- revoke session
- revoke token
- revoke API key
- revoke consent grant

### Suspend

Use suspend when temporarily disabling a resource without deleting it.

Examples:

- suspend identity
- suspend app

### Delete

Use delete only when the product behavior is deletion, including soft-delete semantics.

If the real behavior is deactivate, revoke, or archive, use that term instead of delete.

## Product Communication Rules

### 1. Prefer one canonical noun per concept

Avoid pairs like:

- tenant and org
- app and client
- user and identity
- secret and credential

Choose one primary term, then allow the secondary term only in tightly scoped contexts.

### 2. Separate product language from protocol language

Good examples:

- "Register an app" in UI copy
- "OAuth client authentication failed" in protocol docs

### 3. Make the security boundary visible

When a term is also an isolation boundary, say so explicitly.

Recommended example:

- "A tenant is the isolation boundary for apps, identities, and audit data."

### 4. Prefer lifecycle verbs over generic verbs

Prefer:

- revoke session
- rotate API key
- issue token

Instead of:

- change session
- update key
- make token

### 5. Match UI labels to audit and API language where practical

If the UI says revoke API key, the docs and audit event naming should not say delete credential unless there is a strong technical reason.

## Canonical Wording Recommendations

Use these default phrasings in future specs and docs:

- platform bootstrap
- platform admin
- tenant admin
- register app
- create tenant
- create identity
- authenticate identity
- issue token
- rotate API key
- revoke session
- revoke consent grant

Avoid these unless deliberately scoped:

- org as a system term
- workspace as a synonym for tenant
- user when identity is the actual stored resource
- client everywhere outside OAuth-specific language

## Writing Rules for Product Specs

Every feature spec should answer these questions using the glossary terms above:

1. Which actor initiates the action?
2. Which resource changes?
3. Which scope owns the resource: platform, tenant, app, or identity?
4. Is the action create, register, authenticate, authorize, issue, rotate, revoke, suspend, or delete?
5. What should the UI, API, and audit log call this action?

## Decision Summary for Current Repo

For Z0 Auth as it exists today:

- Keep tenant as the canonical product and engineering term.
- Reserve org or organization for a future UI-language decision only.
- Prefer app in product docs and client in OAuth-specific protocol contexts.
- Prefer identity in specs and APIs; use user only when intentionally simplifying audience-facing copy.
- Standardize lifecycle verbs so product specs, docs, audit, and APIs use the same action language.