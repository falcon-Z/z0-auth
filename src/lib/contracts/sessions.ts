export type SessionSummary = {
  id: string;
  clientLabel: string;
  ipDisplay: string | null;
  lastSeenAt: string;
  createdAt: string;
  isCurrent: boolean;
};

export type ListSessionsResponse = {
  sessions: SessionSummary[];
};

export type RevokeSessionResponse = {
  ok: true;
  revokedCurrent: boolean;
};

export type RevokeOtherSessionsResponse = {
  ok: true;
  revokedCount: number;
};
