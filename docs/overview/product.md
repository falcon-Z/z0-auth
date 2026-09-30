# Product overview

Z0Auth is a self-hosted authentication server for applications and APIs. It provides the sign-in system, OAuth 2.0 and OpenID Connect endpoints, token issuance, account recovery, and the administrative tools needed to run those services yourself.

It is intended for teams that want one authentication service they can deploy with their applications instead of building login, MFA, password recovery, OAuth flows, signing keys, and related security controls separately in every product.

Z0Auth is currently being built toward its Alpha release. This overview describes the product we are building. The [Alpha roadmap](alpha.md) contains the detailed release scope.

## What using Z0Auth looks like

A typical application does not handle passwords or authentication ceremonies itself.

The application sends the user to Z0Auth to sign in. Z0Auth handles the configured authentication methods and returns the user to the application through OAuth or OpenID Connect. The application receives the identity or access information it needs and continues to own its own product data and permission rules.

For APIs, Z0Auth issues access tokens that the API can verify before accepting a request.

For background services and other machine-to-machine integrations, applications can register workload clients and request access without pretending that a human user is involved.

## Authentication in one place

A Z0Auth installation can provide the common authentication flows an application would otherwise need to build and maintain itself.

The Alpha plan includes passwords, email verification and recovery, magic links, passkeys, TOTP MFA, recovery codes, and sign-in through Google, Microsoft, GitHub, or another OpenID Connect provider.

Applications use the same hosted authentication service while remaining separate products. When several related applications should share sign-in, they can be configured to do so deliberately instead of each application maintaining another copy of the user's credentials.

## Designed for application developers

Applications register with Z0Auth and use standard OAuth 2.0 and OpenID Connect flows.

A web application, browser application, backend service, and API can have different protocol configuration without becoming different products in Z0Auth. Applications can register the APIs they call, control which access they may request, and rotate credentials without changing the user's account.

The Alpha release focuses on Authorization Code with PKCE for interactive sign-in and Client Credentials for machine-to-machine access.

## Designed to be operated by you

Z0Auth is self-hosted. The service runs with PostgreSQL and is configured and administered by the team operating it.

The operator controls the deployment, keys, external identity providers, authentication policy, applications, clients, and other instance configuration. Z0Auth provides the application-level security behavior; the operator remains responsible for the infrastructure it runs on.

The Alpha deployment model is deliberately small. It does not require a separate cache, message broker, or collection of authentication microservices.

## What Z0Auth does not replace

Z0Auth answers who or what has authenticated and issues the protocol credentials applications and APIs use.

It does not become the application's business-authorization system. An application still decides whether a user belongs to the product, which records they may access, which business actions they may perform, and how its own data is stored.

This keeps authentication reusable without forcing unrelated applications to share their internal permission model.

## Where to go next

Read the [Alpha roadmap](alpha.md) to see what is planned for the first release.

The Getting Started documentation will provide the shortest path from a new Z0Auth installation to a working application integration as the corresponding Alpha implementation is completed.

For contributors or readers who need the underlying model, see the [domain model](../design/domain-model.md), [Alpha architecture](../design/alpha-architecture.md), and [threat model](../design/threat-model.md).
