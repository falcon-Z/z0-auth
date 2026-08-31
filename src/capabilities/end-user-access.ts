export type ApplicationIdentityStatus = "active" | "disabled" | "locked" | "deleted";

export type ApplicationIdentityAccess = {
  id: string;
  applicationId: string;
  status: ApplicationIdentityStatus;
};

export type AuthenticateApplicationIdentity = {
  applicationId: string;
  applicationIdentityId: string;
};

export type RevokeApplicationIdentityAccess = AuthenticateApplicationIdentity;

export const RECOVERY_REVOKED_AUTHORITY = [
  "sessions",
  "mfa_challenges",
  "remembered_browsers",
  "authorization_codes",
  "oauth_tokens",
] as const;

export type RecoveryRevokedAuthority = typeof RECOVERY_REVOKED_AUTHORITY[number];

export const ACCESS_REVOKED_AUTHORITY = [
  "sessions",
  "mfa_challenges",
  "remembered_browsers",
  "passkey_ceremonies",
  "authorization_codes",
  "oauth_tokens",
  "password_reset_tokens",
  "email_verification_tokens",
  "magic_links",
  "provider_tokens",
] as const;

export type AccessRevokedAuthority = typeof ACCESS_REVOKED_AUTHORITY[number];

export type ApplicationIdentityAuthentication =
  | { allowed: true; applicationIdentityId: string }
  | { allowed: false; reason: "identity_unavailable" };

export type BeginApplicationIdentityRecovery = {
  applicationId: string;
  email: string;
};

export interface EndUserAccess {
  authenticateApplicationIdentity(
    input: AuthenticateApplicationIdentity,
  ): Promise<ApplicationIdentityAuthentication>;
  beginApplicationIdentityRecovery(
    input: BeginApplicationIdentityRecovery,
  ): Promise<{ accepted: true }>;
  completeApplicationIdentityRecovery(
    input: AuthenticateApplicationIdentity,
  ): Promise<
    | { completed: true; revokedAuthority: readonly RecoveryRevokedAuthority[] }
    | { completed: false; reason: "identity_unavailable" }
  >;
  revokeApplicationIdentityAccess(
    input: RevokeApplicationIdentityAccess,
  ): Promise<
    | { revoked: true; revokedAuthority: readonly AccessRevokedAuthority[] }
    | { revoked: false; reason: "identity_unavailable" }
  >;
}

export type EndUserAccessDependencies = {
  findApplicationIdentity(
    applicationIdentityId: string,
  ): Promise<ApplicationIdentityAccess | null>;
  findApplicationIdentityForRecovery(
    input: BeginApplicationIdentityRecovery,
  ): Promise<ApplicationIdentityAccess | null>;
  beginApplicationIdentityRecovery(
    applicationIdentityId: string,
  ): Promise<void>;
  completeApplicationIdentityRecovery(
    applicationIdentityId: string,
  ): Promise<void>;
  revokeApplicationIdentityAccess(
    applicationIdentityId: string,
  ): Promise<void>;
};

async function findOwnedApplicationIdentity(
  dependencies: EndUserAccessDependencies,
  input: AuthenticateApplicationIdentity,
): Promise<ApplicationIdentityAccess | null> {
  const identity = await dependencies.findApplicationIdentity(
    input.applicationIdentityId,
  );
  return identity?.applicationId === input.applicationId ? identity : null;
}

export function createEndUserAccess(
  dependencies: EndUserAccessDependencies,
): EndUserAccess {
  return {
    async authenticateApplicationIdentity(input) {
      const identity = await findOwnedApplicationIdentity(dependencies, input);
      if (!identity || identity.status !== "active") {
        return { allowed: false, reason: "identity_unavailable" };
      }

      return {
        allowed: true,
        applicationIdentityId: identity.id,
      };
    },

    async beginApplicationIdentityRecovery(input) {
      const identity = await dependencies.findApplicationIdentityForRecovery(input);
      if (
        identity
        && identity.applicationId === input.applicationId
        && (identity.status === "active" || identity.status === "locked")
      ) {
        await dependencies.beginApplicationIdentityRecovery(identity.id);
      }
      return { accepted: true };
    },

    async completeApplicationIdentityRecovery(input) {
      const identity = await findOwnedApplicationIdentity(dependencies, input);
      if (
        !identity
        || (identity.status !== "active" && identity.status !== "locked")
      ) {
        return { completed: false, reason: "identity_unavailable" };
      }

      await dependencies.completeApplicationIdentityRecovery(identity.id);
      return {
        completed: true,
        revokedAuthority: RECOVERY_REVOKED_AUTHORITY,
      };
    },

    async revokeApplicationIdentityAccess(input) {
      const identity = await findOwnedApplicationIdentity(dependencies, input);
      if (!identity) {
        return { revoked: false, reason: "identity_unavailable" };
      }

      await dependencies.revokeApplicationIdentityAccess(identity.id);
      return {
        revoked: true,
        revokedAuthority: ACCESS_REVOKED_AUTHORITY,
      };
    },
  };
}
