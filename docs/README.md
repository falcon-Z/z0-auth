# Z0Auth documentation

Z0Auth documentation is organized around what a reader is trying to do. The active documentation set is being rebuilt for the Alpha product model.

## Available now

- [Product overview](overview/product.md) explains what Z0Auth is and why a team might use it.
- [Alpha support and limitations](overview/support-and-limitations.md) helps evaluate whether the Alpha release fits a use case.
- [Alpha compatibility](overview/compatibility.md) explains what may change during Alpha and what adopters can safely depend on.
- [Alpha roadmap](overview/alpha.md) describes the public Alpha scope, exclusions, and release bar.
- [Alpha architecture](design/alpha-architecture.md) defines the target implementation architecture.
- [Domain model and glossary](design/domain-model.md) defines the product concepts and terminology.
- [Threat model](design/threat-model.md) defines trust boundaries, threats, required controls, and accepted Alpha residual risks.
- [Documentation guide](contributing/documentation.md) defines how repository documentation is organized and written.

## Reader documentation

The public documentation will use six areas.

1. **Overview** explains what Z0Auth is, what Alpha supports, and its limits.
2. **Getting started** takes a reader from a fresh instance to a working application integration.
3. **Guides** cover specific integration, authentication, and administration tasks.
4. **Concepts** explain Z0Auth-specific models and behavior.
5. **Operations** covers deployment, configuration, maintenance, recovery, and incident runbooks.
6. **Reference** records exact protocol, configuration, state, event, error, and API contracts.

Pages are added to these areas as the corresponding Alpha behavior is implemented and verified.

## Engineering documentation

The `design/` directory contains the approved Alpha design baseline. Contributor material lives under `contributing/`.

These documents are not substitutes for user guides. They exist for implementation, review, and maintenance work.

## Archived documentation

[Pre-Alpha documentation](archive/pre-alpha-docs/README.md) is retained for historical reference while the Alpha documentation is rebuilt. It describes an older product and implementation model and must not be treated as the current contract.

## Documentation state

The Alpha roadmap and design documents describe the approved target. A guide, operational procedure, or reference page may describe a feature as available only when the repository implementation and tests support that behavior.
