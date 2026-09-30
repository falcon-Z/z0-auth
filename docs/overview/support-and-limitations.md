# Support and limitations

Z0Auth is a self-hosted authentication server for applications, APIs, and backend services that integrate through OAuth 2.0 and OpenID Connect.

This page describes the main boundaries planned for the Alpha release. For the complete release scope, see the [Alpha roadmap](alpha.md).

## Supported use

Z0Auth is designed for applications that need human sign-in, standards-based token issuance, API protection, single sign-on between related products, or machine-to-machine authentication.

Applications are isolated by default. Related applications can deliberately share authentication through Z0Auth without requiring them to share application data or business permissions.

## Self-hosted operation

Z0Auth is software you operate, not a managed identity service.

A deployment requires the surrounding production infrastructure, including PostgreSQL, HTTPS, secure secret handling, backups, monitoring, and normal operational maintenance. Z0Auth manages authentication and identity security within that environment; it does not operate the environment for you.

## Application responsibilities

Z0Auth determines who or what has authenticated and provides the protocol and security state needed to establish that identity.

Applications remain responsible for their own data and business authorization. Decisions such as whether a user may edit a document, approve an order, or access an application-specific feature belong to the application rather than Z0Auth.

## Product boundaries

For the Alpha release, Z0Auth focuses on the authentication, identity, OAuth, OpenID Connect, and SSO capabilities needed by common application and API integrations.

It is not intended to provide every enterprise identity feature or deployment model in its first release. Capabilities outside the Alpha scope include areas such as enterprise provisioning, cross-instance federation, and multi-region operation.

If your integration depends on a specialized protocol extension or deployment model, check the [Alpha roadmap](alpha.md) before adopting Z0Auth.

## Alpha stability

The Alpha release is an early release stage. Interfaces and behavior may still change, and Z0Auth does not provide an uptime or service-level commitment for this release.

Applications should prefer documented OAuth 2.0 and OpenID Connect interfaces over internal APIs or implementation details. See [Alpha compatibility](compatibility.md) for the compatibility expectations during this stage.

The roadmap describes the target Alpha release; it should not be treated as a guarantee that every planned capability is available in every development build.
