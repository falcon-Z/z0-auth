/** Console dashboard metrics for instance members. */
export type ConsoleSummaryResponse = {
  instance: {
    organizationName: string;
    memberCount: number;
    pendingInviteCount: number;
    userCount: number;
  };
  sessions: {
    activeCount: number;
  };
};
