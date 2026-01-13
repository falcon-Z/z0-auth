/**
 * Organization validation schemas
 * Used by both API and frontend for consistent validation
 */

import { z } from "zod";
import {
  nameSchema,
  slugSchema,
  descriptionSchema,
  organizationStatusSchema,
  optionalPositiveIntSchema,
} from "./common";

/**
 * Create organization schema
 */
export const createOrganizationSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  description: descriptionSchema,
  maxUsers: optionalPositiveIntSchema,
  maxApps: optionalPositiveIntSchema,
});

/**
 * Update organization schema (all fields optional)
 */
export const updateOrganizationSchema = z.object({
  name: nameSchema.optional(),
  slug: slugSchema.optional(),
  description: descriptionSchema,
  maxUsers: optionalPositiveIntSchema,
  maxApps: optionalPositiveIntSchema,
});

/**
 * Update organization status schema
 */
export const updateOrganizationStatusSchema = z.object({
  status: organizationStatusSchema,
});

/**
 * Organization search/filter schema
 */
export const organizationFilterSchema = z.object({
  search: z.string().optional(),
  status: organizationStatusSchema.optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});

// Type exports
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type UpdateOrganizationStatusInput = z.infer<typeof updateOrganizationStatusSchema>;
export type OrganizationFilterInput = z.infer<typeof organizationFilterSchema>;
