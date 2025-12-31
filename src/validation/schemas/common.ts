/**
 * Common validation schemas
 * Reusable field validators shared across API and frontend
 */

import { z } from "zod";

/**
 * Slug validation - lowercase alphanumeric with dashes
 */
export const slugSchema = z
  .string()
  .min(2, "Slug must be at least 2 characters")
  .max(50, "Slug must be 50 characters or less")
  .regex(
    /^[a-z0-9-]+$/,
    "Slug must be lowercase letters, numbers, and dashes only"
  );

/**
 * Name validation - general purpose name field
 */
export const nameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name must be 100 characters or less");

/**
 * Email validation
 */
export const emailSchema = z
  .string()
  .email("Please enter a valid email address");

/**
 * Description validation - optional text field
 */
export const descriptionSchema = z
  .string()
  .max(500, "Description must be 500 characters or less")
  .optional();

/**
 * URL validation
 */
export const urlSchema = z.string().url("Please enter a valid URL");

/**
 * Status enums
 */
export const organizationStatusSchema = z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]);
export const userStatusSchema = z.enum(["ACTIVE", "INACTIVE", "PENDING", "SUSPENDED", "DELETED"]);
export const appStatusSchema = z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]);

/**
 * Role enums
 */
export const orgRoleTypeSchema = z.enum([
  "ORG_OWNER",
  "ORG_ADMIN",
  "ORG_DEVELOPER",
  "ORG_MEMBER",
]);

export const appRoleTypeSchema = z.enum(["APP_OWNER", "APP_MANAGER", "APP_USER"]);

export const platformRoleTypeSchema = z.enum([
  "SUPER_ADMIN",
  "ORG_MANAGER",
  "SECURITY_MANAGER",
  "AUDITOR",
  "SUPPORT_MANAGER",
]);

/**
 * Password validation
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

/**
 * Allowed origins validation (array of URLs)
 */
export const allowedOriginsSchema = z
  .array(z.string().url("Each origin must be a valid URL"))
  .optional();

/**
 * Allowed origins as comma-separated string (for form input)
 */
export const allowedOriginsStringSchema = z
  .string()
  .optional()
  .transform((val) => {
    if (!val || val.trim() === "") return [];
    return val
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  });

/**
 * Positive integer for limits
 */
export const positiveIntSchema = z
  .number()
  .int("Must be a whole number")
  .positive("Must be greater than 0");

/**
 * Optional positive integer
 */
export const optionalPositiveIntSchema = positiveIntSchema.optional().nullable();

// Type exports for the schemas
export type SlugInput = z.infer<typeof slugSchema>;
export type NameInput = z.infer<typeof nameSchema>;
export type EmailInput = z.infer<typeof emailSchema>;
export type OrgRoleTypeInput = z.infer<typeof orgRoleTypeSchema>;
export type AppRoleTypeInput = z.infer<typeof appRoleTypeSchema>;
export type OrganizationStatusInput = z.infer<typeof organizationStatusSchema>;
