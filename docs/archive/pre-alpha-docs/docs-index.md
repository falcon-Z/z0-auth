# Z0Auth documentation

This directory is organized by the kind of question a reader is trying to answer. The Alpha roadmap and design documents describe the intended Alpha target; current architecture and data-model documents describe the repository as implemented today while reconciliation continues.

## Product and release scope

- [Product overview](product/overview.md) — product orientation and user-facing model.
- [Z0 Alpha roadmap](roadmap/alpha.md) — public Alpha scope, exclusions, and acceptance bar.

## Architecture and domain design

- [Alpha architecture specification](architecture/alpha.md) — target Alpha architecture and implementation constraints.
- [Domain model and glossary](architecture/domain-model.md) — canonical Alpha concepts, boundaries, relationships, and terminology.
- [Current repository architecture](architecture/current.md) — current implementation architecture.
- [Current data model](architecture/data-model.md) — current persistence/data-model reference.

## Security

- [Threat model](security/threat-model.md) — actors, assets, trust boundaries, threats, controls, and accepted Alpha residual risks.
- [API security contract](../../api/security-contract.md) — concrete session, CSRF, cookie, OAuth, and API security rules.

## API and integration

- [API documentation](../../api/README.md) — entry point for API contracts and integration references.
- [API contracts](../../api/CONTRACTS.md)
- [Validation matrix](../../api/validation-matrix.md)
- [UI flow contract](../../api/ui-flows.md)
- [OpenAPI references](../../api/references/)

## Operations

- [Deployment](operations/deployment.md) — deployment, production configuration, backup, recovery, and platform notes.

## Contributing

- [Local development](contributing/development.md) — development setup, test database, build, and local workflow.
- [Documentation style guide](contributing/documentation-guidelines.md) — documentation structure, voice, accuracy, and security-sensitive writing rules.

## Document authority

For Alpha planning and implementation, use the documents according to their purpose:

1. The stable Alpha requirements baseline defines required product behavior.
2. The domain model defines the shared meaning of core concepts.
3. The threat model defines security threats and required control boundaries.
4. The Alpha architecture specification makes those requirements concrete for implementation.
5. Current architecture, current data model, API contracts, and shipped-behavior guides describe the repository as it exists and must be reconciled toward the Alpha target where they differ.

The [Alpha roadmap](roadmap/alpha.md) is the public-facing release summary. It is intentionally consolidated rather than a line-by-line reproduction of the internal requirements baseline.
