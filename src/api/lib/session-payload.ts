import type { AuthenticatedSessionPayload, SessionResponse } from "@z0/contracts/auth";

import { getUserById } from "./auth";
import { getInstanceSettings } from "./instance";
import { isBootstrapMember, isInstanceMember } from "./instance-members";
import { getMemberRoleSummaries, getMemberScopeKeys } from "./platform-rbac";

export async function buildAuthenticatedSessionPayload(userId: string): Promise<SessionResponse> {
  const user = await getUserById(userId);
  if (!user) {
    return { authenticated: false };
  }

  const settings = await getInstanceSettings();
  const member = await isInstanceMember(userId);
  const bootstrap = member ? await isBootstrapMember(userId) : false;
  const scopes = member ? await getMemberScopeKeys(userId) : [];
  const roleRows = member ? await getMemberRoleSummaries(userId) : [];
  const roles = roleRows.map((role) => role.name);

  const payload: AuthenticatedSessionPayload = {
    authenticated: true,
    user,
    isInstanceMember: member,
    isBootstrap: bootstrap,
    organizationName: settings.organizationName,
    scopes,
    roles,
  };
  return payload;
}
