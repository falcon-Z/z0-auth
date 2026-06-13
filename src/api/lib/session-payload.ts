import type { AuthenticatedSessionPayload, SessionResponse } from "@z0/contracts/auth";

import { getUserById } from "./auth";
import { getInstanceSettings } from "./instance";
import { isBootstrapMember, isInstanceMember } from "./instance-members";

export async function buildAuthenticatedSessionPayload(userId: string): Promise<SessionResponse> {
  const user = await getUserById(userId);
  if (!user) {
    return { authenticated: false };
  }

  const settings = await getInstanceSettings();
  const member = await isInstanceMember(userId);
  const bootstrap = member ? await isBootstrapMember(userId) : false;

  const payload: AuthenticatedSessionPayload = {
    authenticated: true,
    user,
    isInstanceMember: member,
    isBootstrap: bootstrap,
    organizationName: settings.organizationName,
  };
  return payload;
}
