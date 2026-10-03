export type ServiceGroupAccess = {
  id: string;
  accountDomainId: string;
  applicationIds: readonly string[];
  ssoEnabled: boolean;
};

export type AuthorizeSharedSignIn = {
  serviceGroup: ServiceGroupAccess;
  source: { applicationId: string; accountId: string; accountDomainId: string; eligible: boolean };
  target: {
    applicationId: string;
    accountId: string | null;
    accountDomainId: string;
    subjectId: string | null;
    membershipStatus: "active" | "disabled" | "removed";
    eligible: boolean;
  };
};

export type SharedSignInDecision =
  | { outcome: "reuse_account"; targetSubjectId: string }
  | { outcome: "denied"; reason: "service_group_not_available" | "source_identity_unavailable"
    | "different_account" | "target_membership_unavailable" };

export interface ServiceGroups {
  resolveSharedSignIn(input: AuthorizeSharedSignIn): SharedSignInDecision;
}

export function createServiceGroups(): ServiceGroups {
  return {
    resolveSharedSignIn({ serviceGroup: group, source, target }) {
      if (!group.ssoEnabled || source.applicationId === target.applicationId
        || !group.applicationIds.includes(source.applicationId) || !group.applicationIds.includes(target.applicationId)
        || source.accountDomainId !== group.accountDomainId || target.accountDomainId !== group.accountDomainId) {
        return { outcome: "denied", reason: "service_group_not_available" };
      }
      if (!source.eligible) return { outcome: "denied", reason: "source_identity_unavailable" };
      if (target.accountId !== source.accountId) return { outcome: "denied", reason: "different_account" };
      if (!target.subjectId || target.membershipStatus !== "active" || !target.eligible) {
        return { outcome: "denied", reason: "target_membership_unavailable" };
      }
      return { outcome: "reuse_account", targetSubjectId: target.subjectId };
    },
  };
}
