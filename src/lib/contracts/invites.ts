export type InvitePreviewResponse = {
  status: "pending" | "accepted" | "declined" | "revoked" | "expired";
  email: string;
  invitedName: string;
  organization: { id: string; name: string; slug: string };
  expiresAt: string;
  /** True when a user row exists for the invite email. */
  accountExists: boolean;
  viewer: {
    authenticated: boolean;
    emailMatches: boolean;
    email?: string;
  };
};

export type CreateInviteRequest = {
  email: string;
  invitedName: string;
  roleKeys: string[];
};

export type CreateInviteResponse = {
  id: string;
  inviteUrl: string;
  expiresAt: string;
  email: string;
  invitedName: string;
  roleKeys: string[];
};

export type AcceptInviteRequest = {
  /** Required when creating a new account from the invite. */
  password?: string;
  passwordConfirm?: string;
  /** Required for new accounts when not prefilled on the invite. */
  name?: string;
};

export type AcceptInviteResponse = {
  ok: true;
  userId: string;
  tenantId: string;
};

export type TenantMember = {
  userId: string;
  email: string;
  name: string;
  roleKeys: string[];
  joinedAt: string;
};

export type PendingInvite = {
  id: string;
  email: string;
  invitedName: string;
  roleKeys: string[];
  expiresAt: string;
  createdAt: string;
};

export type RoleSummary = {
  key: string;
  scope: "platform" | "tenant";
  description: string;
};
