/** Console dashboard metrics for the signed-in user (scoped by permission). */
export type ConsoleSummaryResponse = {
  /** Active tenant context when one is selected. */
  tenant?: {
    id: string;
    name: string;
    memberCount: number;
    pendingInviteCount: number;
  };
  /** Counts visible to platform operators. */
  platform?: {
    userCount: number;
  };
  /** Always includes membership count for the current user. */
  membership: {
    tenantCount: number;
  };
  /** Sessions for the signed-in user. */
  sessions: {
    activeCount: number;
  };
};
