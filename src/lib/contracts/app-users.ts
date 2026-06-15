import type { EmailDeliveryStatus } from "./email-delivery";

export type AppUserMembershipStatus = "active" | "disabled";

export type AppUserSummary = {
  userId: string;
  appId: string;
  email: string;
  name: string;
  membershipStatus: AppUserMembershipStatus;
  joinedAt: string;
};

export type AppUserDetail = AppUserSummary & {
  metadata: Record<string, unknown> | null;
  activeSessionCount: number;
};

export type CreateAppUserRequest = {
  email: string;
  name: string;
  password: string;
  passwordConfirm: string;
  metadata?: Record<string, unknown> | null;
};

export type PatchAppUserRequest = {
  name?: string;
  membershipStatus?: AppUserMembershipStatus;
  metadata?: Record<string, unknown> | null;
};

export type CreateAppUserInviteRequest = {
  email: string;
  invitedName: string;
};

export type CreateAppUserInviteResponse = {
  id: string;
  inviteUrl: string;
  expiresAt: string;
  email: string;
  invitedName: string;
  emailDelivery: EmailDeliveryStatus;
};

export type PendingAppUserInvite = {
  id: string;
  email: string;
  invitedName: string;
  expiresAt: string;
  createdAt: string;
};

export type AppUserInvitePreviewResponse = {
  status: "pending" | "accepted" | "declined" | "revoked" | "expired";
  email: string;
  invitedName: string;
  appId: string;
  appName: string;
  expiresAt: string;
  accountExists: boolean;
  viewer: {
    authenticated: boolean;
    emailMatches: boolean;
    email?: string;
  };
};

export type AcceptAppUserInviteRequest = {
  name?: string;
  password?: string;
  passwordConfirm?: string;
};
