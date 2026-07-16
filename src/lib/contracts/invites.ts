import type { EmailDeliveryStatus } from "./email-delivery";

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
  /** Role IDs to assign when the invite is accepted. Defaults to Developer. */
  roleIds?: string[];
};

export type RoleSummary = {
  id: string;
  key: string;
  name: string;
};

export type CreateInviteResponse = {
  id: string;
  inviteUrl: string;
  expiresAt: string;
  email: string;
  invitedName: string;
  roles: RoleSummary[];
  emailDelivery: EmailDeliveryStatus;
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
  status: "active" | "disabled" | "locked" | "deleted";
  emailVerified: boolean;
  disabledAt: string | null;
  lockedUntil: string | null;
  deletedAt: string | null;
  roles: RoleSummary[];
};

export type PendingInvite = {
  id: string;
  email: string;
  invitedName: string;
  expiresAt: string;
  createdAt: string;
  roles: RoleSummary[];
};
