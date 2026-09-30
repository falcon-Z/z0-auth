# Product overview

Z0Auth is a self-hosted OAuth 2.0 and OpenID Connect server for applications, APIs, and workloads.

A Z0Auth deployment provides the identity and authentication layer for software that does not want to depend on a hosted identity provider. The operator runs the service and PostgreSQL, controls the deployment keys and policy, and decides which applications, clients, resources, and identity providers belong to the instance.

This page describes the approved Alpha product model. Features described here are part of the Alpha target. Use task guides and reference pages to determine which behavior is available in the current implementation.

## What Z0Auth owns

Z0Auth owns authentication and the security state required to support it.

That includes:

- accounts and login identifiers inside an Account Domain;
- passwords, passkeys, TOTP factors, recovery codes, and recovery state;
- links to configured external identity providers;
- Z0Auth browser sessions and authentication assurance;
- OAuth and OpenID Connect authorization flows;
- access, refresh, and ID token issuance;
- signing keys and public verification material;
- operator identities, roles, and Platform Owner authority;
- security audit records and identity lifecycle events.

Applications remain responsible for their own application data and application-specific authorization decisions.

## One deployment is one security boundary

A Z0Auth Instance is one independently operated deployment.

Separate instances do not share accounts, credentials, sessions, configuration, or authoritative state in Alpha. Running two applications on the same instance also does not make them share users automatically.

PostgreSQL is the authoritative state store. A production deployment may run more than one Z0Auth application replica against the same database and key material.

## Identity is isolated by default

Each application belongs to an Account Domain.

An Account Domain is the boundary within which end-user identity, authenticators, recovery state, and Z0Auth sessions are shared. An independent application normally has its own Account Domain.

Applications share an Account Domain only when they are deliberately configured as an SSO Group. Applications in the same SSO Group can reuse the same underlying account and Z0Auth session, but they do not automatically share application data, membership, or authorization.

Matching email addresses do not make identities equal across Account Domains.

## Applications, clients, and resources are different things

An Application represents the product-level relationship between Z0Auth and a relying application.

An Application may have more than one OAuth/OIDC Client. For example, one product may have a server-backed web client and a browser client without creating separate application identities for the same user.

A Client owns protocol configuration such as its client identifier, security class, redirect URIs, browser origins, permitted flows, credentials, and the resources or scopes it may request.

A Resource represents an API or resource server. Access tokens are issued for registered resources and carry an explicit audience. Resource servers validate those tokens and enforce their own application authorization rules.

## Accounts and application membership are separate

An Account is the durable end-user identity inside one Account Domain.

Applications identify an authenticated account through a stable Application Subject. The subject is not the user's email address and does not change merely because a login identifier changes.

Application Membership is separate from authentication. An account can authenticate successfully without that fact alone deciding whether the application accepts the user as a member or what the user may do inside the application.

This separation is especially important for SSO Groups, where several applications share authentication while retaining their own membership and authorization decisions.

## Human authentication

The Alpha target includes:

- password authentication;
- email verification and password recovery;
- passwordless email or magic-link authentication;
- passkeys through WebAuthn;
- TOTP multi-factor authentication;
- recovery codes;
- Google, Microsoft, and GitHub sign-in;
- generic OpenID Connect identity providers.

Authentication policy belongs to the Account Domain. Applications request the level of assurance they require rather than controlling the user's authenticator enrollment directly.

Z0Auth distinguishes baseline authentication from stronger authentication that satisfies an MFA or additional-verification requirement.

## OAuth and OpenID Connect

The Alpha protocol scope is intentionally limited.

For interactive users, Z0Auth supports Authorization Code with PKCE. Public clients do not receive a client secret merely to imitate a confidential client.

For machine access, confidential workload clients use Client Credentials.

OpenID Connect support includes discovery, ID Tokens, and UserInfo for supported flows.

The Alpha target does not include the Implicit Grant or Resource Owner Password Credentials flow.

## Tokens

Access tokens are short-lived RS256 JWT bearer tokens.

Each access token has an explicit issuer and a registered resource audience. Resource servers validate the signature, issuer, audience, expiry, and the authority required by the request without depending on an online Z0Auth introspection call.

Refresh tokens are opaque and rotate when used. Refresh-token families track lineage so replay can be detected and contained.

ID Tokens describe the authentication result for OpenID Connect clients. They are not substitutes for access tokens to application APIs.

## Workloads are not users

Client Credentials represents machine authority.

A workload authenticates as a workload principal and receives authority for registered resources and scopes. It does not acquire a human subject merely because it belongs to the same application.

Human delegation and on-behalf-of token exchange are outside the Alpha release.

## Operators are a separate identity domain

The Platform Owner and other Z0Auth operators do not become application users simply because they administer the instance.

The Platform Owner is the unique instance ownership authority. Admin, Viewer/Auditor, and custom operator roles provide ordinary administrative permissions without replacing ownership.

High-risk administrative actions require stronger authentication and leave audit evidence. Platform Owner recovery is a separate host-controlled break-glass path rather than an ordinary administrator reset.

## Self-hosting responsibilities

Z0Auth owns application-level identity and protocol behavior. The self-hosting operator owns the infrastructure around it.

The operator is responsible for:

- host and runtime security;
- PostgreSQL operation and infrastructure protection;
- HTTPS and reverse-proxy configuration;
- deployment-secret protection;
- backup of required data, keys, and configuration;
- clock synchronization;
- network controls;
- monitoring and incident response.

The Alpha architecture uses Bun for the application runtime and PostgreSQL for authoritative state. It does not require Redis, Kafka, a service mesh, or a separate authentication microservice.

## Alpha boundaries

Alpha focuses on a small set of flows and security properties that can be implemented and tested as one system.

The release does not require cross-instance federation, active-active multi-region writes, device authorization, dynamic client registration, PAR, JAR, DPoP, mTLS-bound access tokens, SCIM, adaptive risk scoring, user-facing OAuth consent management, or human on-behalf-of delegation.

See the [Alpha roadmap](alpha.md) for the complete release scope and deferred work.

## Read next

- [Alpha roadmap](alpha.md) for release scope and acceptance criteria.
- [Domain model and glossary](../design/domain-model.md) for precise product terminology.
- [Alpha architecture](../design/alpha-architecture.md) for implementation design.
- [Threat model](../design/threat-model.md) for trust boundaries and security requirements.
