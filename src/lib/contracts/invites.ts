export type InvitePreviewResponse = {
  status: "pending" | "accepted" | "declined" | "revoked" | "expired";
  email: string;
  invitedName: string;
  organizationName: string;
  expiresAt: string;
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
};

export type CreateInviteResponse = {
  id: string;
  inviteUrl: string;
  expiresAt: string;
  email: string;
  invitedName: string;
};

export type AcceptInviteRequest = {
  password?: string;
  passwordConfirm?: string;
  name?: string;
};

export type AcceptInviteResponse = {
  ok: true;
  userId: string;
};

export type InstanceMember = {
  userId: string;
  email: string;
  name: string;
  joinedAt: string;
  isBootstrap: boolean;
};

export type PendingInvite = {
  id: string;
  email: string;
  invitedName: string;
  expiresAt: string;
  createdAt: string;
};

