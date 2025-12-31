/**
 * Member type definitions
 * Single source of truth for organization and app member types
 */

import type { OrgRoleType, AppRoleType, InvitationStatus } from "./roles";

/**
 * Organization member - active member with user info
 */
export interface OrgMember {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  avatar?: string | null;
  roleType: OrgRoleType;
  isDefault: boolean;
  grantedAt: string;
  memberStatus: "active" | "invited";
}

/**
 * Organization invitation - pending member
 */
export interface OrgInvitation {
  id: string;
  email: string;
  roleType: OrgRoleType;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  invitedBy?: {
    id: string;
    name: string;
    email: string;
  };
}

/**
 * Combined member list item (can be active or invited)
 */
export interface OrgMemberListItem {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  roleType: OrgRoleType;
  status: "active" | "invited";
  joinedAt?: string;
  invitedAt?: string;
}

/**
 * Application member
 */
export interface AppMember {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  avatar?: string | null;
  roleType: AppRoleType;
  grantedAt: string;
}

/**
 * Application invitation
 */
export interface AppInvitation {
  id: string;
  email: string;
  roleType: AppRoleType;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

// Input types for member operations

export interface InviteMemberInput {
  email: string;
  roleType: OrgRoleType;
  sendEmail?: boolean;
}

export interface UpdateMemberRoleInput {
  roleType: OrgRoleType;
}

export interface AddMemberInput {
  email: string;
  name?: string;
  roleType: OrgRoleType;
  sendInvite?: boolean;
}

export interface InviteAppMemberInput {
  email: string;
  roleType: AppRoleType;
  sendEmail?: boolean;
}
