/**
 * Application validation schemas
 * Used for app CRUD and related operations
 */

import { z } from "zod";
import {
  nameSchema,
  slugSchema,
  descriptionSchema,
  appStatusSchema,
  allowedOriginsSchema,
  allowedOriginsStringSchema,
} from "./common";

/**
 * Create application schema (API - expects array)
 */
export const createAppSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  description: descriptionSchema,
  allowedOrigins: allowedOriginsSchema,
});

/**
 * Create application form schema (Frontend - accepts comma-separated string)
 */
export const createAppFormSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  description: descriptionSchema,
  allowedOrigins: allowedOriginsStringSchema,
});

/**
 * Update application schema
 */
export const updateAppSchema = z.object({
  name: nameSchema.optional(),
  slug: slugSchema.optional(),
  description: descriptionSchema,
  allowedOrigins: allowedOriginsSchema,
});

/**
 * Update application form schema (Frontend)
 */
export const updateAppFormSchema = z.object({
  name: nameSchema.optional(),
  slug: slugSchema.optional(),
  description: descriptionSchema,
  allowedOrigins: allowedOriginsStringSchema,
});

/**
 * Update application status schema
 */
export const updateAppStatusSchema = z.object({
  status: appStatusSchema,
});

/**
 * Application search/filter schema
 */
export const appFilterSchema = z.object({
  search: z.string().optional(),
  status: appStatusSchema.optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});

/**
 * Create API key schema
 */
export const createApiKeySchema = z.object({
  name: nameSchema,
  expiresAt: z.string().datetime().optional(),
});

/**
 * Regenerate app secret schema
 */
export const regenerateSecretSchema = z.object({
  confirmName: z.string().min(1, "Please confirm the app name"),
});

// Type exports
export type CreateAppInput = z.infer<typeof createAppSchema>;
export type CreateAppFormInput = z.infer<typeof createAppFormSchema>;
export type UpdateAppInput = z.infer<typeof updateAppSchema>;
export type UpdateAppFormInput = z.infer<typeof updateAppFormSchema>;
export type UpdateAppStatusInput = z.infer<typeof updateAppStatusSchema>;
export type AppFilterInput = z.infer<typeof appFilterSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
