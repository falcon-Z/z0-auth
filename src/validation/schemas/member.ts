/**
 * Member validation schemas
 * Used for organization and app member operations
 */

import { z } from "zod";
import {
  emailSchema,
  nameSchema,
  orgRoleTypeSchema,
  appRoleTypeSchema,
} from "./common";

/**
 * Invite member to organization schema
 */
export const inviteMemberSchema = z.object({
  email: emailSchema,
  roleType: orgRoleTypeSchema,
  sendEmail: z.boolean().optional().default(true),
});

/**
 * Add member directly (creates user if needed)
 */
export const addMemberSchema = z.object({
  email: emailSchema,
  name: nameSchema.optional(),
  roleType: orgRoleTypeSchema,
  sendInvite: z.boolean().optional().default(true),
});

/**
 * Update member role schema
 */
export const updateMemberRoleSchema = z.object({
  roleType: orgRoleTypeSchema,
});

/**
 * Invite member to app schema
 */
export const inviteAppMemberSchema = z.object({
  email: emailSchema,
  roleType: appRoleTypeSchema,
  sendEmail: z.boolean().optional().default(true),
});

/**
 * Update app member role schema
 */
export const updateAppMemberRoleSchema = z.object({
  roleType: appRoleTypeSchema,
});

/**
 * Member lookup schema (for checking if user exists)
 */
export const memberLookupSchema = z.object({
  email: emailSchema,
});

/**
 * Bulk invite schema
 */
export const bulkInviteSchema = z.object({
  emails: z.array(emailSchema).min(1, "At least one email is required"),
  roleType: orgRoleTypeSchema,
  sendEmail: z.boolean().optional().default(true),
});

// Type exports
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type InviteAppMemberInput = z.infer<typeof inviteAppMemberSchema>;
export type UpdateAppMemberRoleInput = z.infer<typeof updateAppMemberRoleSchema>;
export type MemberLookupInput = z.infer<typeof memberLookupSchema>;
export type BulkInviteInput = z.infer<typeof bulkInviteSchema>;
