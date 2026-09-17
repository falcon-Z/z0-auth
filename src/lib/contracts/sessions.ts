export type SessionSummary = {
  id: string;
  clientLabel: string;
  ipDisplay: string | null;
  lastSeenAt: string;
  createdAt: string;
  isCurrent: boolean;
};

export type OperatorSessionSummary = SessionSummary & {
  primaryAuthenticatedAt: string;
  mfaAuthenticatedAt: string | null;
  authenticationMethod: string;
  assuranceLevel: "primary" | "multi_factor" | "phishing_resistant";
  idleExpiresAt: string;
  absoluteExpiresAt: string;
};

export type ListSessionsResponse = {
  sessions: OperatorSessionSummary[];
};

export type RevokeSessionResponse = {
  ok: true;
  revokedCurrent: boolean;
};

export type RevokeOtherSessionsResponse = {
  ok: true;
  revokedCount: number;
};
