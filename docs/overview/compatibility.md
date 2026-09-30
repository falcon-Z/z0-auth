# Compatibility during Alpha

Z0Auth is still establishing its public contracts. Breaking changes may occur when they are necessary for security, correctness, or a coherent product model.

This page defines what adopters can reasonably depend on during the Alpha stage.

## Prefer documented protocol interfaces

OAuth 2.0 and OpenID Connect are the primary application integration boundary.

When Z0Auth documents support for a protocol flow or contract, integrations should depend on that documented behavior rather than internal routes, database structures, implementation modules, or incidental response fields.

Project-specific administrative APIs and configuration may change more frequently while the product is still in Alpha.

## Breaking changes

Changes may affect configuration, administrative APIs, database schemas, deployment requirements, and application-facing behavior that has not reached a stable contract.

Breaking changes should be deliberate and documented. Security and correctness take priority over preserving an interface that is incomplete or incorrect.

The project does not currently promise long-term semantic-versioning stability.

## Persisted state and migrations

Changes to security-sensitive persisted state should use explicit migrations when that state can reasonably be preserved.

An upgrade must not silently reinterpret existing credentials, sessions, grants, identities, or other security state merely to avoid a migration.

When operator action is required, release documentation should identify what changed, what must be migrated or reconfigured, and what cannot be carried forward safely.

## Undocumented behavior is not a contract

Internal routes, tables, modules, incidental fields, and other undocumented implementation details may change without compatibility guarantees.

Material under `docs/archive/` is historical reference and must not be treated as an active contract.

## What this means for adopters

The current release stage is appropriate for evaluation, development, and integrations that can absorb breaking changes.

Before upgrading or depending on a project-specific interface, check the documentation and release notes for the version you are using. The [roadmap](alpha.md) describes planned release scope; it does not itself guarantee that a capability exists in every development build.
