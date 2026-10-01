import { describe, expect, test } from "bun:test";
import { createServiceGroups, type AuthorizeSharedSignIn } from "../../src/capabilities/service-groups";

const base: AuthorizeSharedSignIn = {
  serviceGroup: { id: "group", accountDomainId: "domain", applicationIds: ["a", "b"], ssoEnabled: true },
  source: { applicationId: "a", accountId: "account", accountDomainId: "domain", eligible: true },
  target: { applicationId: "b", accountId: "account", accountDomainId: "domain", subjectId: "subject-b",
    membershipStatus: "active", eligible: true },
};
describe("shared Account sign-in", () => {
  const capability = createServiceGroups();
  test("reuses canonical Account with independent application subject", () => {
    expect(capability.resolveSharedSignIn(base)).toEqual({ outcome: "reuse_account", targetSubjectId: "subject-b" });
  });
  test("does not infer sharing or membership", () => {
    for (const input of [
      { ...base, serviceGroup: { ...base.serviceGroup, ssoEnabled: false } },
      { ...base, source: { ...base.source, eligible: false } },
      { ...base, target: { ...base.target, accountId: "other-account" } },
      { ...base, target: { ...base.target, accountDomainId: "other-domain" } },
      { ...base, target: { ...base.target, applicationId: "outside" } },
      { ...base, target: { ...base.target, subjectId: null } },
      { ...base, target: { ...base.target, membershipStatus: "removed" as const } },
      { ...base, target: { ...base.target, membershipStatus: "disabled" as const } },
      { ...base, target: { ...base.target, eligible: false } },
    ]) expect(capability.resolveSharedSignIn(input).outcome).toBe("denied");
  });
});
