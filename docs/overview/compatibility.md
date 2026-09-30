# Alpha compatibility

Z0Auth Alpha is still allowed to change.

The project is building toward a coherent first release rather than preserving every interface that existed during development. If an API, configuration shape, database model, or behavior conflicts with the Alpha product or security model, it may change even when that change is breaking.

This page describes what adopters can reasonably expect while Z0Auth is in Alpha.

## Standards are the stable integration boundary

Applications should integrate with Z0Auth through documented OAuth 2.0 and OpenID Connect behavior rather than depending on internal implementation details.

Where Z0Auth claims support for a standard flow or protocol contract, the goal is interoperability with that contract. Changes may still occur during Alpha, but the project should not introduce arbitrary application-specific behavior where a standards-based interface exists.

Project-specific APIs and configuration have a weaker compatibility guarantee during Alpha.

## Breaking changes are possible

During Alpha, changes may affect:

- configuration;
- administrative APIs;
- database schemas;
- deployment requirements;
- application-facing behavior that has not yet reached a stable contract.

A breaking change should be deliberate and documented. Security and correctness take priority over keeping an incorrect or incomplete interface unchanged.

Alpha does not yet promise long-term semantic-versioning stability.

## Existing state should be migrated deliberately

Changes to persisted authentication or security state should use explicit migrations when that state can reasonably be preserved.

An upgrade must not silently reinterpret existing credentials, sessions, grants, identities, or other security-sensitive state as something different merely to avoid a migration.

Some changes may still require operator action. When they do, the release documentation should state what changed, what must be migrated or reconfigured, and what cannot be carried forward safely.

## Do not depend on undocumented behavior

Internal routes, database tables, implementation modules, incidental response fields, and other undocumented behavior are not compatibility contracts.

If an integration depends on something that is not documented as part of the supported interface, assume it may change.

The same applies to material under `docs/archive/`. Archived documentation describes earlier product models and is not an active compatibility promise.

## Documentation follows compatibility

When a supported contract changes, the documentation that describes it should change in the same release.

Current guides and reference pages describe supported behavior. The [Alpha roadmap](alpha.md) describes the target release and may include behavior that is not yet available in the current implementation.

## After Alpha

The compatibility policy will become stricter as Z0Auth moves beyond Alpha.

The project has not yet defined its post-Alpha versioning and deprecation guarantees. Those guarantees should be published before users are expected to rely on long-term compatibility across releases.

For now, adopters should treat Alpha as suitable for evaluation, development, and early integration where breaking changes can be absorbed.
