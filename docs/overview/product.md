# Z0Auth

Z0Auth is an open-source, self-hosted authentication server for applications, APIs, and backend services.

It gives developers a central place to handle sign-in, identity, OAuth 2.0 and OpenID Connect, and the security work that grows around them. Instead of rebuilding authentication for every application, you run Z0Auth once and connect your products to it using standard protocols.

Z0Auth is being built toward its first Alpha release.

## Why use Z0Auth?

Authentication rarely ends with a login form. Applications eventually need recovery, stronger authentication, external identity providers, secure sessions, token issuance, credential rotation, and administration.

Z0Auth keeps that work in one service.

It is intended for teams that want to own their authentication infrastructure without maintaining a different authentication system in every product, or depending entirely on a hosted identity provider.

## What it provides

Z0Auth covers the main pieces needed to run authentication across applications:

- **Modern sign-in** with passwords, passkeys, MFA, recovery, and external identity providers.
- **OAuth 2.0 and OpenID Connect** for browser, server, API, and service integrations.
- **Single sign-on** for related applications that should share authentication.
- **API and machine authentication** through access tokens and client credentials.
- **Administration and security controls** for applications, credentials, sessions, keys, and audit activity.
- **Self-hosted operation** so the deployment, database, secrets, and surrounding infrastructure remain under your control.

The goal is not to replace an application's own business rules. Z0Auth handles authentication and identity infrastructure; applications continue to decide what their users are allowed to do.

## What can you build with it?

A single Z0Auth installation can sit behind a web application, a browser client and API, several related products that share sign-in, or backend services that need machine credentials.

The applications can use the same authentication system without all having to be built the same way.

## Alpha status

Z0Auth is currently being built toward its first Alpha release.

See the [Alpha roadmap](alpha.md) for the capabilities, boundaries, and release criteria planned for Alpha.

## Next steps

If you are evaluating Z0Auth, start with the [Alpha roadmap](alpha.md).

If you want to run or integrate Z0Auth, use the Getting Started guides for the shortest path from installation to a working application.

If you want to contribute, use the [documentation index](../README.md) to find the architecture, domain model, threat model, and contributor material.
