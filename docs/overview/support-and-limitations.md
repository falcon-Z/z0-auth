# Alpha support and limitations

Z0Auth Alpha is aimed at teams that want to run their own authentication service for web applications, APIs, and backend services.

This page is a quick fit check. It summarizes the shape of the Alpha release rather than listing every supported feature or protocol detail. The [Alpha roadmap](alpha.md) contains the complete release scope.

## A good fit for Alpha

Z0Auth is a good fit when you want a self-hosted authentication service and are comfortable operating the infrastructure around it.

The Alpha release is designed for applications that need standard OAuth 2.0 or OpenID Connect integration, modern user authentication, API protection, single sign-on between related products, or machine-to-machine access.

It is also intended for teams that want to keep control of their authentication data, deployment, keys, and policy instead of depending entirely on a hosted identity provider.

## What Alpha expects from you

Z0Auth is self-hosted software, not a managed service.

You are responsible for running the service and PostgreSQL, providing HTTPS, protecting deployment secrets, maintaining backups, and operating the surrounding infrastructure. Z0Auth provides the authentication system; it does not remove normal production operations.

Applications also remain responsible for their own business permissions and application data.

## What Alpha deliberately keeps small

The first release focuses on the common authentication and authorization-server workflows needed by web applications, APIs, and services.

It does not try to cover every OAuth extension, every enterprise provisioning model, every deployment topology, or every form of federation in its first release.

Areas such as advanced OAuth extensions, enterprise provisioning, cross-instance federation, multi-region operation, and deep customization are beyond the Alpha target.

If one of those areas is central to your use case, check the [Alpha roadmap](alpha.md) before planning an integration.

## Alpha is not a stability promise

Alpha is the first coherent release target, not a long-term compatibility contract.

Configuration, APIs, schemas, and behavior may still change when needed to correct the product or security model. Where practical, changes that affect persisted state should include a migration path, but consumers should expect some breaking changes during Alpha development.

Z0Auth also does not make a production uptime or service-level commitment in Alpha.

## Current implementation status

The Alpha product model is defined, but the repository is still being reconciled toward it.

That means the roadmap describes the intended Alpha release, while individual features may still be incomplete or changing in the current codebase. Task guides and reference pages will describe behavior as available only when the implementation and tests support it.

Do not treat the presence of a planned feature in the roadmap as proof that it is already ready to use.

If this matches the kind of authentication system you are looking for, continue with the [product overview](product.md) or the [Alpha roadmap](alpha.md).
