import type { AuthenticatedSessionPayload, SessionResponse } from "@z0/contracts/auth";

import { getUserById } from "./auth";
import { getInstanceSettings } from "./instance";
import { isInstanceMember } from "./instance-members";

export async function buildAuthenticatedSessionPayload(userId: string): Promise<SessionResponse> {
  const user = await getUserById(userId);
  if (!user) {
    return { authenticated: false };
  }

  const settings = await getInstanceSettings();
  const member = await isInstanceMember(userId);

  const payload: AuthenticatedSessionPayload = {
    authenticated: true,
    user,
    isInstanceMember: member,
    organizationName: settings.organizationName,
  };
  return payload;
}
