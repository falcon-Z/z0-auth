# Z0Auth

Z0Auth is an open-source, self-hosted authentication and identity server for applications, APIs, and backend services.

It gives an application a central authentication system instead of requiring every product to build and maintain its own login, session, credential, recovery, token, and identity infrastructure. Applications integrate with Z0Auth through OAuth 2.0 and OpenID Connect, while the deployment and its data remain under the operator's control.

Z0Auth handles authentication and the security state around identity. Applications still own their business data, application membership, and decisions about what an authenticated user is allowed to do.

## What you can use Z0Auth for

Z0Auth is intended for systems that need one or more of the following:

- authentication for web applications and APIs;
- OAuth 2.0 and OpenID Connect integration;
- shared sign-in across related applications;
- access tokens for protected APIs;
- machine-to-machine authentication for backend services;
- centrally managed credentials, sessions, recovery, and authentication security;
- a self-hosted alternative to outsourcing the authentication system to a managed identity provider.

A single Z0Auth deployment can serve multiple applications without forcing them to share users or application data. Applications are isolated by default, and related applications can deliberately share authentication when that is part of their product model.

## Project status

Z0Auth is being built toward its first **Alpha release**. The release scope is defined, but development builds may not yet include every planned capability, and interfaces or configuration may still change.

Before adopting Z0Auth, review the [support and limitations](overview/support-and-limitations.md), the [roadmap](overview/alpha.md), and the [compatibility policy](overview/compatibility.md).

## Where to go next

### Evaluate Z0Auth

Read [Support and limitations](overview/support-and-limitations.md) to determine whether Z0Auth fits your deployment and integration requirements.

Read the [Alpha roadmap](overview/alpha.md) when you need the planned release scope, exclusions, or acceptance criteria.

Read [Compatibility during Alpha](overview/compatibility.md) before depending on project-specific APIs, configuration, persisted state, or other interfaces that may change.

### Run Z0Auth locally

Use the [Quickstart](getting-started/quickstart.md) to start Z0Auth with PostgreSQL using Docker, complete first-instance setup, and sign in to the administration interface.

The quickstart is intended for local evaluation and development rather than production deployment.

### Understand or contribute to the system

If you are implementing, reviewing, or changing Z0Auth itself, use:

- [API documentation](api/README.md) for HTTP contracts, OpenAPI references, validation, and hosted authentication flows.
- [Domain model and glossary](design/domain-model.md) for the concepts and terminology used throughout the system.
- [Alpha architecture](design/alpha-architecture.md) for the target system structure and implementation boundaries.
- [Threat model](design/threat-model.md) for the security boundaries, threats, controls, and accepted release risks.
- [Documentation guide](contributing/documentation.md) when writing or changing project documentation.

These design documents describe Z0Auth internally. Application integrations should rely on documented product and protocol interfaces rather than implementation details.

## The main boundary to keep in mind

Z0Auth answers **who authenticated, how they authenticated, and what protocol authority was issued**.

Your application answers **what that identity is allowed to do inside the application**.

Keeping that boundary clear makes it possible to use one authentication system across different products without moving application-specific permissions, business rules, or data into Z0Auth.
