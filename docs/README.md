# Z0Auth documentation

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

Z0Auth is currently being built toward its first **Alpha release**.

Alpha is the current release target for Z0Auth, not a separate product. The target scope is defined, but development builds may not yet provide every capability planned for that release. Interfaces and configuration may also change while the project is in Alpha.

If you are considering Z0Auth for a project, read the [support and limitations](overview/support-and-limitations.md) and the [Alpha roadmap](overview/alpha.md). The [Alpha compatibility policy](overview/compatibility.md) explains what integrations can and cannot safely depend on at this stage.

## Start with the path that matches what you need

### Understand Z0Auth

Read the [product overview](overview/product.md) for a concise explanation of the problem Z0Auth solves, its main capabilities, and where it fits in an application architecture.

Then use:

- [Support and limitations](overview/support-and-limitations.md) to understand the current product boundaries.
- [Alpha roadmap](overview/alpha.md) to see the scope and release bar for the first Alpha release.
- [Alpha compatibility](overview/compatibility.md) to understand stability and breaking-change expectations.

### Run Z0Auth locally

Use the [Quickstart](getting-started/quickstart.md) to start Z0Auth with PostgreSQL using Docker, complete first-instance setup, and sign in to the administration interface.

The quickstart is intended for local evaluation and development rather than production deployment.

### Understand the system design

If you are contributing to Z0Auth or need to understand its internal model, start with:

- [Domain model and glossary](design/domain-model.md) for the concepts and terminology used throughout the project.
- [Alpha architecture](design/alpha-architecture.md) for the target system structure and implementation boundaries.
- [Threat model](design/threat-model.md) for the security boundaries, threats, controls, and accepted Alpha risks.

These documents describe the design of Z0Auth. They are useful when implementing, reviewing, or changing the system, but application integrations should rely on the documented product and protocol interfaces rather than internal implementation details.

### Contribute to the documentation

The [documentation guide](contributing/documentation.md) explains how Z0Auth documentation is structured and how new pages should be written.

## The main boundary to keep in mind

Z0Auth answers **who authenticated, how they authenticated, and what protocol authority was issued**.

Your application answers **what that identity is allowed to do inside the application**.

Keeping that boundary clear makes it possible to use one authentication system across different products without moving application-specific permissions, business rules, or data into Z0Auth.
