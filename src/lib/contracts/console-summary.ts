/** Console dashboard metrics for instance members. */
export type ConsoleSummaryResponse = {
  instance: {
    organizationName: string;
    memberCount: number;
    pendingInviteCount: number;
    appCount: number;
    /** SMTP configured, enabled, and verified — transactional email can send. */
    emailReady: boolean;
  };
  sessions: {
    activeCount: number;
  };
};
