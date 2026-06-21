import type { SessionSummary } from "@z0/contracts/sessions";

import { apiFetch } from "./http-client";

export async function fetchAppUserSessions(
  appId: string,
  userId: string,
): Promise<SessionSummary[]> {
  const { sessions } = await apiFetch<{ sessions: SessionSummary[] }>(
    `/api/v1/apps/${appId}/users/${userId}/sessions`,
  );
  return sessions;
}

export async function revokeAppUserSession(
  appId: string,
  userId: string,
  sessionId: string,
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/v1/apps/${appId}/users/${userId}/sessions/${sessionId}`, {
    method: "DELETE",
  });
}
