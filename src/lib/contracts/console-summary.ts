/** Console dashboard metrics for the signed-in user (scoped by permission). */
export type ConsoleSummaryResponse = {
  /** Active tenant context when one is selected and caller may read org metrics. */
  tenant?: {
    id: string;
    name: string;
    memberCount: number;
    pendingInviteCount: number;
  };
  /** Instance-wide counts for platform operators. */
  platform?: {
    userCount?: number;
    tenantCount?: number;
  };
  /** Organizations this user belongs to (membership list / switcher). */
  membership: {
    tenantCount: number;
  };
  /** Sessions for the signed-in user. */
  sessions: {
    activeCount: number;
  };
};
