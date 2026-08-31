import { describe, expect, test } from "bun:test";

import { createServiceGroups } from "../../src/capabilities/service-groups";

describe("Service Groups capability", () => {
  test("shared sign-in requires both Applications and identities in the same Service Group Link Set", () => {
    const capability = createServiceGroups();
    const serviceGroup = {
      id: "group-a",
      applicationIds: ["application-a", "application-b"],
      ssoEnabled: true,
    };
    const linkSet = {
      serviceGroupId: "group-a",
      applicationIdentities: {
        "application-a": "identity-a",
        "application-b": "identity-b",
      },
    };

    expect(capability.resolveSharedSignIn({
      source: {
        applicationId: "application-a",
        applicationIdentityId: "identity-a",
        eligible: true,
        linkVerified: true,
      },
      target: {
        applicationId: "application-b",
        applicationIdentityEligible: true,
        hasUnlinkedApplicationIdentity: false,
      },
      serviceGroup,
      linkSet,
    })).toEqual({ outcome: "use_linked_identity", targetApplicationIdentityId: "identity-b" });

    expect(capability.resolveSharedSignIn({
      source: {
        applicationId: "application-a",
        applicationIdentityId: "identity-a",
        eligible: true,
        linkVerified: true,
      },
      target: {
        applicationId: "application-outside",
        applicationIdentityEligible: true,
        hasUnlinkedApplicationIdentity: false,
      },
      serviceGroup,
      linkSet,
    })).toEqual({ outcome: "denied", reason: "service_group_not_available" });

    expect(capability.resolveSharedSignIn({
      source: {
        applicationId: "application-a",
        applicationIdentityId: "unlinked-identity",
        eligible: true,
        linkVerified: true,
      },
      target: {
        applicationId: "application-b",
        applicationIdentityEligible: true,
        hasUnlinkedApplicationIdentity: false,
      },
      serviceGroup,
      linkSet,
    })).toEqual({ outcome: "denied", reason: "link_not_verified" });
  });

  test("shared sign-in identifies when the target Application needs JIT Provisioning", () => {
    const capability = createServiceGroups();

    expect(capability.resolveSharedSignIn({
      source: {
        applicationId: "application-a",
        applicationIdentityId: "identity-a",
        eligible: true,
        linkVerified: true,
      },
      target: {
        applicationId: "application-b",
        hasUnlinkedApplicationIdentity: false,
      },
      serviceGroup: {
        id: "group-a",
        applicationIds: ["application-a", "application-b"],
        ssoEnabled: true,
      },
      linkSet: {
        serviceGroupId: "group-a",
        applicationIdentities: { "application-a": "identity-a" },
      },
    })).toEqual({ outcome: "jit_provisioning_required" });
  });

  test("shared sign-in preserves source and target safety gates", () => {
    const capability = createServiceGroups();
    const base = {
      source: {
        applicationId: "application-a",
        applicationIdentityId: "identity-a",
        eligible: true,
        linkVerified: true,
      },
      target: {
        applicationId: "application-b",
        hasUnlinkedApplicationIdentity: false,
      },
      serviceGroup: {
        id: "group-a",
        applicationIds: ["application-a", "application-b"],
        ssoEnabled: true,
      },
      linkSet: {
        serviceGroupId: "group-a",
        applicationIdentities: { "application-a": "identity-a" },
      },
    };

    expect(capability.resolveSharedSignIn({
      ...base,
      source: { ...base.source, eligible: false },
    })).toEqual({ outcome: "denied", reason: "source_identity_unavailable" });
    expect(capability.resolveSharedSignIn({
      ...base,
      target: { ...base.target, hasUnlinkedApplicationIdentity: true },
    })).toEqual({ outcome: "denied", reason: "target_identity_proof_required" });
  });
});
