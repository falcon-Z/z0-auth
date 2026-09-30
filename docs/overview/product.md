# Z0Auth

Z0Auth is an open-source, self-hosted authentication and identity server for applications, APIs, and backend services.

It gives an application the pieces that are difficult to build well and expensive to maintain separately: sign-in, account recovery, multi-factor authentication, social and enterprise login, OAuth 2.0 and OpenID Connect, token issuance, single sign-on, and the administration needed to operate them.

Instead of putting authentication logic into every application, you run Z0Auth once and connect your applications to it using standard protocols.

Z0Auth is under active development toward its first Alpha release.

## Why Z0Auth?

Authentication starts small and rarely stays small.

A login form quickly becomes password storage, email verification, forgotten-password flows, MFA, passkeys, session management, external identity providers, OAuth clients, signing keys, token validation, audit history, and recovery procedures. Each new application creates the same problem again.

Z0Auth provides that infrastructure as one service you can run and control yourself.

It is intended for developers and teams that want:

- a self-hosted alternative to managed authentication services;
- one authentication system for several applications and APIs;
- standard OAuth 2.0 and OpenID Connect integration instead of application-specific authentication code;
- modern authentication methods without implementing each one independently;
- control over deployment, data, keys, and authentication policy;
- an authentication service that can also handle machine-to-machine access.

## What Z0Auth provides

### Hosted authentication

Applications can send users to Z0Auth to sign in instead of building and securing their own authentication pages.

Z0Auth handles the authentication flow and returns the user to the application through OAuth 2.0 or OpenID Connect.

### Passwords, passkeys, and MFA

Z0Auth supports the authentication methods expected from a modern application, including passwords, passkeys, TOTP multi-factor authentication, recovery codes, email verification, password recovery, and passwordless email sign-in.

Applications can rely on the same authentication service as their sign-in requirements grow instead of replacing their original login system later.

### External identity providers

Users can sign in with providers such as Google, Microsoft, and GitHub, or through another OpenID Connect provider.

Applications integrate with Z0Auth rather than implementing a separate login integration for every upstream identity provider.

### OAuth 2.0 and OpenID Connect

Z0Auth acts as the authorization and identity server for applications.

It provides the protocol endpoints applications need for user sign-in, identity information, access tokens, refresh tokens, and public signing keys. APIs can validate issued access tokens before serving protected requests.

### Single sign-on

Related applications can share sign-in when that is useful.

A user can authenticate once and move between applications that have been configured to share sign-in, while unrelated applications can remain separate.

### Application and API management

Operators can register applications, OAuth clients, APIs, redirect URLs, browser origins, scopes, and credentials from one administrative system.

This allows a product to have different web, browser, API, or backend components without maintaining separate authentication systems for each one.

### Machine-to-machine authentication

Backend services can authenticate without inventing a user account for a machine.

Z0Auth supports client credentials for service-to-service access and issues tokens that APIs can validate using the same identity infrastructure used by interactive applications.

### Administration and security operations

Z0Auth includes the operational parts of running an authentication service, including operator access, credential management, session management, audit records, signing keys, recovery controls, and security-sensitive configuration.

Because Z0Auth is self-hosted, the team operating it controls where it runs and how its database, secrets, network, backups, and surrounding infrastructure are managed.

## What can you use it for?

Z0Auth can provide authentication for:

- a web application that needs hosted sign-in and account recovery;
- a browser application with a separate API;
- several related products that should share sign-in;
- an API that accepts OAuth access tokens;
- backend services that need machine-to-machine credentials;
- a self-hosted product that should not depend on a third-party authentication service.

Applications still own their product data and business permissions. Z0Auth handles identity and authentication; it does not try to become the business logic of every application connected to it.

## Alpha status

Z0Auth is being built toward its first Alpha release. The product direction is defined, but implementation and documentation are still being reconciled to that release.

The [Alpha roadmap](alpha.md) describes what the first release will support and what is intentionally deferred.

## Start here

If you are evaluating the project, read the [Alpha roadmap](alpha.md) next.

If you want to run or integrate Z0Auth, the Getting Started guides will provide the shortest path from a fresh installation to a working application as the Alpha implementation becomes available.

If you are contributing to Z0Auth, the [documentation index](../README.md) links to the architecture, domain model, threat model, and contributor material.
