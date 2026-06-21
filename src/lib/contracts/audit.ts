export type AuditEventSummary = {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ListAuditEventsResponse = {
  events: AuditEventSummary[];
  hasMore: boolean;
};
