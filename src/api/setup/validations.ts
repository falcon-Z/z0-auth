import { z } from "zod";
import { validatePassword } from "@z0/utils/password-validation";

/**
 * Schema Definitions for Setup API
 * Following schema-driven approach with Zod validation
 */

// Custom password validation using our comprehensive password validator
const passwordSchema = z.string().refine(
  (password) => {
    const validation = validatePassword(password);
    return validation.isValid;
  },
  {
    message:
      "Password must meet all security requirements: minimum 8 characters, uppercase, lowercase, numbers, special characters, and avoid common patterns",
  }
);

// Enhanced email validation with additional security checks
const emailSchema = z
  .string()
  .email("Please enter a valid email address")
  .min(5, "Email must be at least 5 characters")
  .max(254, "Email must not exceed 254 characters") // RFC 5321 limit
  .refine(
    (email) => {
      // Additional security checks
      const normalizedEmail = email.toLowerCase().trim();

      // Check for suspicious patterns
      const suspiciousPatterns = [
        /\.\./, // Double dots
        /^\./, // Starting with dot
        /\.$/, // Ending with dot
        /@\./, // @ followed by dot
        /\.@/, // Dot followed by @
      ];

      return !suspiciousPatterns.some((pattern) =>
        pattern.test(normalizedEmail)
      );
    },
    {
      message: "Email contains invalid patterns",
    }
  )
  .transform((email) => email.toLowerCase().trim()); // Normalize email

// Enhanced name validation with sanitization
const nameSchema = z
  .string()
  .min(1, "Name is required")
  .max(100, "Name must not exceed 100 characters")
  .refine(
    (name) => {
      // Check for valid characters (letters, spaces, hyphens, apostrophes)
      const validNamePattern = /^[a-zA-Z\s\-'\.]+$/;
      return validNamePattern.test(name.trim());
    },
    {
      message:
        "Name can only contain letters, spaces, hyphens, apostrophes, and periods",
    }
  )
  .transform((name) => name.trim().replace(/\s+/g, " ")); // Normalize whitespace

// Enhanced organization validation with sanitization
const organizationSchema = z
  .string()
  .min(2, "Organization name must be at least 2 characters")
  .max(200, "Organization name must not exceed 200 characters")
  .refine(
    (org) => {
      // Check for valid characters (letters, numbers, spaces, common punctuation)
      const validOrgPattern = /^[a-zA-Z0-9\s\-'\.&,()]+$/;
      return validOrgPattern.test(org.trim());
    },
    {
      message: "Organization name contains invalid characters",
    }
  )
  .transform((org) => org.trim().replace(/\s+/g, " ")); // Normalize whitespace

// Slug validation schema for organization slug
const slugSchema = z
  .string()
  .min(2, "Slug must be at least 2 characters")
  .max(100, "Slug must not exceed 100 characters")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must be lowercase alphanumeric with hyphens only"
  );

/**
 * Request Schemas
 */

// Email validation request
export const validateEmailSchema = z.object({
  email: emailSchema,
});

// Organization validation request
export const validateOrganizationSchema = z.object({
  name: organizationSchema,
  slug: slugSchema.optional(),
});

// Complete setup request
export const superAdminSetupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  organization: organizationSchema,
});

/**
 * Response Schemas
 */

// Generic success response
export const successResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  requestId: z.string().optional(),
});

// Email validation response
export const emailValidationResponseSchema = successResponseSchema.extend({
  available: z.boolean(),
  email: z.string().email(),
});

// Organization validation response
export const organizationValidationResponseSchema =
  successResponseSchema.extend({
    available: z.boolean(),
    name: z.string(),
    suggestedSlug: z.string().optional(),
  });

// Setup eligibility response
export const setupEligibilityResponseSchema = z.object({
  eligible: z.boolean(),
  configured: z.boolean(),
  message: z.string(),
  requestId: z.string().optional(),
});

// Setup complete response
export const setupCompleteResponseSchema = successResponseSchema.extend({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    roleType: z.string(),
    scopes: z.array(z.string()),
  }),
});

/**
 * Type Exports
 */
export type ValidateEmailRequest = z.infer<typeof validateEmailSchema>;
export type ValidateOrganizationRequest = z.infer<
  typeof validateOrganizationSchema
>;
export type SuperAdminSetupData = z.infer<typeof superAdminSetupSchema>;
export type EmailValidationResponse = z.infer<
  typeof emailValidationResponseSchema
>;
export type OrganizationValidationResponse = z.infer<
  typeof organizationValidationResponseSchema
>;
export type SetupEligibilityResponse = z.infer<
  typeof setupEligibilityResponseSchema
>;
export type SetupCompleteResponse = z.infer<typeof setupCompleteResponseSchema>;

/**
 * Utility Functions
 */

// Generate slug from organization name
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}
