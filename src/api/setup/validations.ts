import { z } from "zod";

/**
 * Zod schema for super admin registration.
 * Requires name, email, and password.
 */
export const validateSuperAdmin = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type SuperAdminInput = z.infer<typeof validateSuperAdmin>;
