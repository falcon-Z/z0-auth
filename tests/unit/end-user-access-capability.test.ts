import { describe, expect, test } from "bun:test";

import { createEndUserAccess } from "../../src/capabilities/end-user-access";

describe("End User Access capability", () => {
  test("an Application can authenticate only its own active Application Identity", async () => {
    const capability = createEndUserAccess({
      findApplicationIdentity: async (identityId) => ({
        id: identityId,
        applicationId: "application-a",
        status: "active",
      }),
      findApplicationIdentityForRecovery: async () => null,
      beginApplicationIdentityRecovery: async () => undefined,
      completeApplicationIdentityRecovery: async () => undefined,
      revokeApplicationIdentityAccess: async () => undefined,
    });

    expect(await capability.authenticateApplicationIdentity({
      applicationId: "application-a",
      applicationIdentityId: "identity-a",
    })).toEqual({ allowed: true, applicationIdentityId: "identity-a" });

    expect(await capability.authenticateApplicationIdentity({
      applicationId: "application-b",
      applicationIdentityId: "identity-a",
    })).toEqual({ allowed: false, reason: "identity_unavailable" });
  });

  test("recovery conceals whether an Application Identity exists", async () => {
    const recoveryRequests: string[] = [];
    const capability = createEndUserAccess({
      findApplicationIdentity: async () => null,
      findApplicationIdentityForRecovery: async ({ applicationId, email }) => (
        applicationId === "application-a" && email === "known@example.com"
          ? { id: "identity-a", applicationId, status: "active" }
          : null
      ),
      beginApplicationIdentityRecovery: async (identityId) => {
        recoveryRequests.push(identityId);
      },
      completeApplicationIdentityRecovery: async () => undefined,
      revokeApplicationIdentityAccess: async () => undefined,
    });

    expect(await capability.beginApplicationIdentityRecovery({
      applicationId: "application-a",
      email: "known@example.com",
    })).toEqual({ accepted: true });
    expect(await capability.beginApplicationIdentityRecovery({
      applicationId: "application-a",
      email: "missing@example.com",
    })).toEqual({ accepted: true });
    expect(recoveryRequests).toEqual(["identity-a"]);
  });

  test("completing recovery revokes every authority protected by recovery", async () => {
    const recovered: string[] = [];
    const capability = createEndUserAccess({
      findApplicationIdentity: async (identityId) => ({
        id: identityId,
        applicationId: "application-a",
        status: "locked",
      }),
      findApplicationIdentityForRecovery: async () => null,
      beginApplicationIdentityRecovery: async () => undefined,
      completeApplicationIdentityRecovery: async (identityId) => {
        recovered.push(identityId);
      },
      revokeApplicationIdentityAccess: async () => undefined,
    });

    expect(await capability.completeApplicationIdentityRecovery({
      applicationId: "application-a",
      applicationIdentityId: "identity-a",
    })).toEqual({
      completed: true,
      revokedAuthority: [
        "sessions",
        "mfa_challenges",
        "remembered_browsers",
        "authorization_codes",
        "oauth_tokens",
      ],
    });
    expect(recovered).toEqual(["identity-a"]);
  });

  test("revocation is scoped to the owning Application", async () => {
    const revoked: string[] = [];
    const capability = createEndUserAccess({
      findApplicationIdentity: async (identityId) => ({
        id: identityId,
        applicationId: "application-a",
        status: "active",
      }),
      findApplicationIdentityForRecovery: async () => null,
      beginApplicationIdentityRecovery: async () => undefined,
      completeApplicationIdentityRecovery: async () => undefined,
      revokeApplicationIdentityAccess: async (identityId) => {
        revoked.push(identityId);
      },
    });

    expect(await capability.revokeApplicationIdentityAccess({
      applicationId: "application-b",
      applicationIdentityId: "identity-a",
    })).toEqual({ revoked: false, reason: "identity_unavailable" });
    expect(await capability.revokeApplicationIdentityAccess({
      applicationId: "application-a",
      applicationIdentityId: "identity-a",
    })).toEqual({
      revoked: true,
      revokedAuthority: [
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
      ],
    });
    expect(revoked).toEqual(["identity-a"]);
  });
});
