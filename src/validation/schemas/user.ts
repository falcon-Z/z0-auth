/**
 * User validation schemas
 * Used for user CRUD and related operations
 */

import { z } from "zod";
import { nameSchema, emailSchema, userStatusSchema, platformRoleTypeSchema } from "./common";

// Alias for readability
const platformRoleSchema = platformRoleTypeSchema;

/**
 * Create platform user schema (grant platform access)
 */
export const createPlatformUserSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  roleType: platformRoleSchema,
  scopes: z.array(z.string()).optional(),
});

/**
 * Update platform user schema
 */
export const updatePlatformUserSchema = z.object({
  roleType: platformRoleSchema.optional(),
  scopes: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Update user profile schema
 */
export const updateUserProfileSchema = z.object({
  name: nameSchema.optional(),
  avatar: z.string().url("Invalid URL").optional(),
});

/**
 * Change password schema
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * User filter schema
 */
export const userFilterSchema = z.object({
  search: z.string().optional(),
  status: userStatusSchema.optional(),
  roleType: platformRoleSchema.optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});

// Type exports
export type CreatePlatformUserInput = z.infer<typeof createPlatformUserSchema>;
export type UpdatePlatformUserInput = z.infer<typeof updatePlatformUserSchema>;
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UserFilterInput = z.infer<typeof userFilterSchema>;
