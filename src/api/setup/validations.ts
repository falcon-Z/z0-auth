import { z } from "zod";
import { validatePassword } from "@z0/utils/password-validation";

// Custom password validation using our comprehensive password validator
const passwordSchema = z.string().refine(
  (password) => {
    const validation = validatePassword(password);
    return validation.isValid;
  },
  {
    message: "Password must meet all security requirements: minimum 8 characters, uppercase, lowercase, numbers, special characters, and avoid common patterns",
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
        /\.\./,  // Double dots
        /^\./, // Starting with dot
        /\.$/, // Ending with dot
        /@\./, // @ followed by dot
        /\.@/, // Dot followed by @
      ];
      
      return !suspiciousPatterns.some(pattern => pattern.test(normalizedEmail));
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
      message: "Name can only contain letters, spaces, hyphens, apostrophes, and periods",
    }
  )
  .transform((name) => name.trim().replace(/\s+/g, ' ')); // Normalize whitespace

// Enhanced organization validation with sanitization
const organizationSchema = z
  .string()
  .min(1, "Organization is required")
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
  .transform((org) => org.trim().replace(/\s+/g, ' ')); // Normalize whitespace

export const superAdminSetupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  organization: organizationSchema,
});

// Type for the validated and sanitized data
export type SuperAdminSetupData = z.infer<typeof superAdminSetupSchema>;
