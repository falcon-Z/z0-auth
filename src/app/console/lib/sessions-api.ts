import type {
  ListSessionsResponse,
  RevokeOtherSessionsResponse,
  RevokeSessionResponse,
} from "@z0/contracts/sessions";

import { apiFetch } from "./http-client";

export async function fetchSessions(): Promise<ListSessionsResponse["sessions"]> {
  const { sessions } = await apiFetch<ListSessionsResponse>("/api/v1/sessions");
  return sessions;
}

export async function revokeSession(sessionId: string): Promise<RevokeSessionResponse> {
  return apiFetch<RevokeSessionResponse>(`/api/v1/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export async function revokeOtherSessions(): Promise<RevokeOtherSessionsResponse> {
  return apiFetch<RevokeOtherSessionsResponse>("/api/v1/sessions/revoke-others", {
    method: "POST",
    body: {},
  });
}
