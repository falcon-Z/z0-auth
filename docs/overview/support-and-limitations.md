# Support and limitations

This page is for deciding whether Z0Auth fits a deployment or integration. It describes the important product boundaries and operational assumptions without duplicating the detailed release scope in the [roadmap](alpha.md).

## Where Z0Auth fits

Z0Auth is intended for teams that want to operate their own authentication infrastructure for web applications, APIs, and backend services.

It supports the common shape of an application platform: human authentication, OAuth 2.0 and OpenID Connect integration, protected APIs, machine-to-machine authentication, and deliberate single sign-on between related applications.

A deployment may serve multiple applications without making those applications share users, data, or permissions. Shared authentication is explicit rather than an automatic consequence of using the same Z0Auth instance.

## Where Z0Auth does not fit

Z0Auth is not a managed identity service. If you need a provider to operate the authentication infrastructure for you, Z0Auth does not provide that service model.

The current release target also does not cover every enterprise identity or deployment model. Areas such as cross-instance federation, continuous provisioning, active-active multi-region operation, and several advanced OAuth extensions are outside the current scope.

The [roadmap](alpha.md) is the authoritative place to check whether a specific capability is planned for the release.

## Deployment assumptions

Running Z0Auth means operating security-sensitive infrastructure.

A production deployment requires an operator-managed PostgreSQL database, HTTPS, secure secret handling, backups, monitoring, and the surrounding host or container infrastructure. Z0Auth can manage authentication and identity-security state inside that environment, but it cannot secure or operate the environment on the operator's behalf.

The [Quickstart](../getting-started/quickstart.md) is for local evaluation and development, not production deployment.

## Responsibility boundary

Z0Auth is responsible for authentication, identity-security state, sessions, and the OAuth/OIDC authority it issues.

Applications remain responsible for their business data, application membership, and application-specific authorization. A valid Z0Auth identity or access token does not decide whether a user may edit a document, approve an order, view a record, or perform another business action.

Operators remain responsible for the infrastructure and secrets on which the Z0Auth deployment depends.

## Release-stage limitations

Z0Auth is currently targeting its first Alpha release. Breaking changes are possible, and there is no formal uptime or service-level commitment for this stage.

Read [Compatibility during Alpha](compatibility.md) before building an integration that depends on project-specific APIs, configuration, database state, or other non-standard interfaces.
