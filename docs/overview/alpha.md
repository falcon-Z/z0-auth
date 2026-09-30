# Alpha roadmap

This roadmap defines the planned scope and acceptance bar for Z0Auth's first Alpha release. It describes the release target, not the feature set of every development build.

## Release goal

The release is complete when a self-hosting operator can deploy and bootstrap Z0Auth, register applications and resources, authenticate human users and workloads, use isolated or explicitly shared SSO identities, issue and validate standards-based tokens, administer and recover the system, and pass the security, protocol, failure, migration, accessibility, and end-to-end acceptance criteria described below.

Z0Auth is designed around a few core boundaries:

- Each deployment is independently operated and self-contained.
- Applications are isolated by default.
- Related applications may deliberately share an account domain through an SSO group.
- Applications continue to own application membership, application data, and application-specific authorization.
- Z0Auth owns authentication, identity-security state, standards-based token issuance, sessions, recovery, and the security state needed to support them.
- APIs are registered resources with explicit audiences and scope relationships.
- Security-sensitive incompatibilities fail explicitly rather than silently weakening protections.

## 1. Application, client, and resource foundation

Z0Auth will provide the management model needed to connect real applications and APIs.

Planned Alpha capabilities include:

- Applications with one or more OAuth/OIDC clients.
- Public and confidential client types with clear security boundaries.
- First-class registered API/resource servers.
- Stable client and resource identifiers.
- Resource-specific authorization and audience-bound access tokens.
- Application-defined scopes and client-level scope restrictions.
- Explicit redirect URI registration with exact matching.
- Explicit browser origins for SPA token-endpoint access.
- Multiple independently managed client secrets for zero-downtime rotation.
- One-time visibility of generated client-secret values.
- Client and application disable, recovery, deletion, and purge lifecycle.
- Safe handling of compromised credentials and destructive changes.

Z0Auth will not treat public browser clients as confidential clients or issue client secrets merely to simulate confidentiality.

## 2. Identity boundaries and shared SSO

Applications are isolated by default. Sharing identity is always deliberate.

Z0Auth will support:

- Independent account domains for applications.
- Explicitly created SSO groups that provide a shared account domain to member applications.
- Stable application-facing subjects that survive ordinary profile or login-identifier changes.
- Application membership that remains separate from shared authentication.
- Shared credentials, authentication methods, recovery, sessions, and external identity links at the SSO account-domain level.
- Application-owned metadata namespaced to an application subject without turning it into shared SSO profile data.
- Durable identity lifecycle events for deletion, restoration, purge, and related lifecycle transitions.

For this release, account-domain placement becomes effectively fixed once identities exist. Migrating populated applications into, out of, or between SSO groups is deferred until a later release.

## 3. Account lifecycle

Z0Auth will support configurable account creation and lifecycle policies.

Account creation may be configured for:

- Open self-signup.
- Invitation-required signup.
- Operator/admin-created accounts.
- External identity provider authentication when account-creation policy permits it.

Account lifecycle will include Active, Suspended, Pending Deletion, and Purged states.

Suspension and deletion will revoke renewable authentication state while preserving the bounded-staleness model of already-issued short-lived self-contained access tokens. Recoverable deletion may restore the same account and subject during the configured grace period. Permanent purge removes Z0Auth-owned authenticatable identity state while leaving application-owned data under the application's control.

## 4. Human authentication and recovery

Z0Auth will support multiple first-party and federated authentication methods:

- Username/email and password.
- Email verification.
- Password recovery.
- Passwordless email / magic-link authentication.
- Passkeys / WebAuthn.
- TOTP MFA.
- Recovery codes.
- Google sign-in.
- Microsoft sign-in.
- GitHub sign-in.
- Generic OpenID Connect identity providers.

Authentication policy belongs to the account domain. Applications request an authentication assurance outcome rather than controlling the mechanics of the authenticator ceremony.

Z0Auth will support baseline authentication and a stronger MFA/additional-verification outcome. User-verified passkeys may satisfy the stronger outcome directly, while TOTP can provide the additional factor. When stronger assurance is required but no eligible factor is enrolled, Z0Auth will support protected just-in-time enrollment and then resume the original transaction.

Passwords will use a modern policy: a 15-character built-in minimum, support for long passwords and Unicode, no arbitrary composition rules, compromised/common-password checks, and Argon2id hashing.

Email verification, magic links, password-reset credentials, recovery codes, and similar capabilities are short-lived or one-time where appropriate and must resist replay.

## 5. Sessions and SSO

Z0Auth will provide server-managed browser sessions for authentication and shared SSO behavior.

The session model will support:

- Reuse of an existing account-domain session across applications that deliberately share an SSO group.
- Separation between authentication and application membership.
- Authentication freshness and step-up requirements.
- Session revocation and logout.
- Standards-based logout propagation where supported.
- Safe session behavior across suspension, credential changes, recovery, and account lifecycle transitions.

Merely running applications in the same Z0Auth instance will not cause them to share sessions or users.

## 6. OAuth 2.0 and OpenID Connect

Z0Auth will focus on a deliberately constrained standards surface that can be implemented and tested well.

Supported interactive flow:

- Authorization Code with PKCE.

Supported workload flow:

- Client Credentials.

OpenID Connect support will include the discovery and identity-token behavior needed by supported clients, along with UserInfo.

Protocol safety will include:

- Strict redirect validation.
- PKCE enforcement where required.
- `state` and `nonce` handling.
- Explicit issuer behavior.
- Explicit client authentication methods.
- Registered resources and resource selection.
- No silent security downgrade when a requested feature or algorithm is unsupported.

Z0Auth will not support the Implicit Grant or Resource Owner Password Credentials flow.

## 7. Tokens, claims, and grants

Z0Auth will use short-lived, self-contained JWT bearer access tokens designed for local verification by resource servers.

Access-token behavior will include:

- Explicit issuer.
- Explicit audience bound to a registered resource.
- Short lifetime.
- Scope and authorization context limited to the requested resource.
- Local verification of signature, issuer, audience, expiry, and permitted authority.

Refresh capability, where enabled, will use opaque rotating refresh tokens with replay protection and revocation semantics.

OpenID Connect will provide ID Tokens and UserInfo. Applications define the meaning of application permissions; Z0Auth issues the agreed scopes and claims but does not replace the application's own authorization layer.

RS256 is the signing algorithm for this release for Z0Auth-issued JWT access tokens and ID Tokens. Z0Auth will publish public verification material through JWKS and support safe signing-key rotation.

## 8. Workload authentication

Machine and workload principals are first-class use cases for this release.

Z0Auth will support explicitly registered confidential clients using Client Credentials to obtain short-lived authority for registered resources.

Interactive human clients and workload clients should remain separate rather than mixing materially different principal roles into one client.

## 9. Administration and operator control

Z0Auth will include an administrative surface for operating the instance.

The operator model will include:

- A unique Platform Owner.
- Built-in Admin and Viewer/Auditor roles.
- Custom operator roles composed from explicit platform scopes.
- Protected one-time first-instance bootstrap.
- Controlled ownership transfer.
- Separate break-glass Platform Owner recovery tied to deployment/host control.
- MFA-grade authentication for privileged operators.
- Fresh privileged step-up for high-risk administrative actions.
- Auditable administrative recovery for ordinary members and Admins.

Ordinary administrators cannot grant themselves Platform Owner authority or supersede the Platform Owner.

## 10. Security, keys, audit, and privacy

Security is part of the release bar rather than a later hardening phase.

Z0Auth will include:

- Rate limiting and abuse protections for authentication, recovery, bootstrap, client authentication, and privileged operations.
- Enumeration-resistant public responses where appropriate.
- Credential-stuffing and repeated-failure defenses without relying on permanent lockout.
- CSRF, XSS/injection, redirect, and SSRF protections appropriate to each surface.
- Multiple signing keys for safe planned rotation.
- Emergency signing-key retirement for suspected compromise.
- Protected storage appropriate to each secret type.
- No credential material in audit or operational logs.
- Append-only security audit behavior through the Z0Auth application.
- Structured audit events for meaningful successful and failed security-sensitive actions.
- Configurable audit retention.
- Separation between security audit data and operational diagnostics.
- Data minimization around identity and security responsibilities.

Infrastructure encryption, host security, database security, and deployment-secret protection remain operator responsibilities.

## 11. Reliability, consistency, and recovery

Z0Auth must fail safely.

The system will:

- Fail closed when authoritative storage is unavailable for operations that require it.
- Keep already-issued self-contained access tokens independently verifiable when Z0Auth itself is unavailable.
- Never treat cache state as the sole authority for a security decision.
- Preserve atomicity for security-sensitive multi-record transitions.
- Make retried logical operations idempotent where duplicate authority would be dangerous.
- Persist security-critical pending and revocation state rather than relying only on process memory.
- Preserve one-time-use and revocation invariants across process restarts.
- Enforce expiry at use time even before asynchronous cleanup runs.
- Use explicit schema/data migrations.
- Document backup and restore requirements, including keys and configuration needed to make restored data usable.

## 12. Deployment and operations

Z0Auth will target a clear, supportable deployment model:

- Bun as the server-side runtime.
- PostgreSQL as the production database target.
- Direct compute or container deployment.
- Operator-provided production database.
- Configuration through environment/configuration with separate secret injection.
- HTTPS for production OAuth/OIDC endpoints.
- Explicit reverse-proxy trust configuration.
- Separate liveness and readiness behavior.
- Graceful shutdown.
- Structured operational logging.
- Aggregate operational/security metrics without high-cardinality personal identifiers.
- Compatibility with standard distributed tracing instrumentation.
- Runbooks for key compromise, credential attacks, database failure, email/IdP outage, failed upgrades, and Platform Owner recovery.

Multiple application replicas may be supported when they share the required authoritative state and coordination mechanisms. Active-active multi-region consistency is outside Alpha.

## 13. Authentication UI and accessibility

Z0Auth-hosted authentication remains inside the Z0Auth security boundary rather than being delegated to the administrative React application.

Z0Auth authentication and administrative interfaces must support:

- Keyboard-only use.
- Assistive technologies and correct semantic structure.
- Predictable focus behavior.
- Visible focus indicators.
- Substantial browser zoom.
- Narrow/mobile layouts.
- Accessible contrast.
- Errors that expose the next safe action without leaking sensitive account state.
- Valid fallback paths when one authentication or recovery method fails and another policy-permitted method remains.
- Clear identification of the requesting application.
- Clear confirmation for destructive or high-impact actions.

Security-sensitive hosted pages will avoid arbitrary third-party analytics, ads, remote fonts, and similar embedded resources.

Z0Auth will be localization-ready, but broad multilingual coverage is not a release requirement.

## 14. Acceptance bar

The release is not considered complete merely because individual endpoints exist. Z0Auth must behave coherently end to end.

The acceptance suite will cover:

- OAuth/OIDC conformance for the flows Z0Auth claims to support.
- Automated security regression coverage.
- Redirect, PKCE, `state`, and `nonce` behavior.
- One-time credential and replay protections.
- Refresh-token rotation and replay detection.
- MFA enrollment and removal.
- Platform Owner bootstrap and recovery.
- Administrative role boundaries.
- Signing-key rotation.
- Concurrent and double-submit security cases.
- Database, email, external IdP, signing-key, process-restart, and interrupted-transaction failures.
- Supported upgrades with persisted security state.
- Backup and restore.
- Keyboard, focus, screen-reader, zoom/responsive, contrast, and accessible error behavior.
- Representative current browser engines.
- Representative server-backed web and SPA integrations.

End-to-end Alpha scenarios include first deployment and bootstrap, registration/login, recovery, magic link, MFA/passkeys, external IdP login/linking, SSO grouping, OAuth/OIDC authorization, refresh/replay handling, workload authentication, administration/RBAC, client-secret rotation, signing-key rotation, account deletion, and representative failure cases.

**The passing acceptance suite is the practical release bar.**

## Explicitly outside Alpha

The following are intentionally deferred and are not blockers for this release:

- Cross-instance federation or trust.
- Migration of populated applications into, out of, or between SSO groups.
- Device Authorization / constrained-device flows.
- Native-app-specific authentication as a first-class client category.
- Implicit Grant and Resource Owner Password Credentials.
- Pushed Authorization Requests (PAR).
- JWT-Secured Authorization Requests (JAR).
- Dynamic Client Registration.
- Required token introspection.
- DPoP or mTLS sender-constrained access tokens.
- `private_key_jwt` or mTLS confidential-client authentication.
- Per-user OAuth consent and Connected Apps management.
- App-to-app user delegation and one-hop token exchange/OBO as an Alpha blocker.
- Multi-hop or durable delegation.
- Z0Auth-managed personal access tokens / developer credentials for application users.
- Adaptive authentication and automated risk scoring.
- SCIM and continuous provisioning/profile synchronization.
- Broad privacy automation and downloadable identity archives.
- Active-active multi-region writes and distributed consistency.
- Deep white-labeling and page-builder-style authentication customization.
- Broad localization coverage.
- Formal production uptime/SLO commitments.

## Post-Alpha directions

The following areas remain valid future directions without implying a particular release or delivery date:

- Cross-instance federation and independent-product federation.
- Safe migration of populated identity domains and SSO groups.
- SCIM/provisioning and richer profile synchronization.
- Richer identity-data export and privacy workflows.
- One-hop token exchange/OBO followed by more advanced delegation models.
- User-facing consent and Connected Apps/grant management.
- Richer authentication-assurance and adaptive-risk policy.
- Device and native-app flows.
- PAR, JAR, Dynamic Client Registration, and additional response modes.
- Additional confidential-client authentication methods.
- Sender-constrained tokens.
- Additional signing algorithms and migration support.
- KMS/HSM/secret-manager integrations.
- Advanced signing-key automation, anomaly detection, alerting, disaster recovery, reliability targets, multi-region operation, theming, and localization.

## Related documentation

- [Support and limitations](support-and-limitations.md) explains the adoption and responsibility boundaries.
- [Compatibility during Alpha](compatibility.md) defines what integrations can rely on at this stage.
- [Alpha architecture specification](../design/alpha-architecture.md) describes the target implementation architecture.
- [Domain model and glossary](../design/domain-model.md) defines the system concepts and terminology.
- [Threat model](../design/threat-model.md) defines the security boundaries, threats, and required controls.
