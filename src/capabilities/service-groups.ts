export type ServiceGroupAccess = {
  id: string;
  applicationIds: readonly string[];
  ssoEnabled: boolean;
};

export type LinkSetAccess = {
  serviceGroupId: string;
  applicationIdentities: Readonly<Record<string, string>>;
};

export type AuthorizeSharedSignIn = {
  source: {
    applicationId: string;
    applicationIdentityId: string;
    eligible: boolean;
    linkVerified: boolean;
  };
  target: {
    applicationId: string;
    applicationIdentityEligible?: boolean;
    hasUnlinkedApplicationIdentity: boolean;
  };
  serviceGroup: ServiceGroupAccess;
  linkSet: LinkSetAccess;
};

export type SharedSignInDecision =
  | { outcome: "use_linked_identity"; targetApplicationIdentityId: string }
  | { outcome: "jit_provisioning_required" }
  | {
    outcome: "denied";
    reason:
      | "service_group_not_available"
      | "source_identity_unavailable"
      | "link_not_verified"
      | "target_identity_unavailable"
      | "target_identity_proof_required";
  };

export interface ServiceGroups {
  resolveSharedSignIn(
    input: AuthorizeSharedSignIn,
  ): SharedSignInDecision;
}

export function createServiceGroups(): ServiceGroups {
  return {
    resolveSharedSignIn(input) {
      const { serviceGroup, linkSet } = input;
      if (
        !serviceGroup.ssoEnabled
        || input.source.applicationId === input.target.applicationId
        || !serviceGroup.applicationIds.includes(input.source.applicationId)
        || !serviceGroup.applicationIds.includes(input.target.applicationId)
        || linkSet.serviceGroupId !== serviceGroup.id
      ) {
        return { outcome: "denied", reason: "service_group_not_available" };
      }

      const linkedSource = linkSet.applicationIdentities[input.source.applicationId];
      const linkedTarget = linkSet.applicationIdentities[input.target.applicationId];
      if (!input.source.eligible) {
        return { outcome: "denied", reason: "source_identity_unavailable" };
      }
      if (!input.source.linkVerified || linkedSource !== input.source.applicationIdentityId) {
        return { outcome: "denied", reason: "link_not_verified" };
      }

      if (linkedTarget) {
        return input.target.applicationIdentityEligible
          ? { outcome: "use_linked_identity", targetApplicationIdentityId: linkedTarget }
          : { outcome: "denied", reason: "target_identity_unavailable" };
      }
      if (input.target.hasUnlinkedApplicationIdentity) {
        return { outcome: "denied", reason: "target_identity_proof_required" };
      }
      return { outcome: "jit_provisioning_required" };
    },
  };
}
