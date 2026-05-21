import { json, problem } from "../lib/http";

/**
 * Authentication API routes (JSON). Public auth UI is served separately under /login, etc.
 */
export const authRoutes = {
  "/api/auth/login": {
    async POST() {
      return problem(501, "Not Implemented", "Login API will be implemented in a follow-up.");
    },
  },

  "/api/auth/register": {
    async POST() {
      return problem(501, "Not Implemented", "Registration API will be implemented in a follow-up.");
    },
  },

  "/api/auth/forgot-password": {
    async POST() {
      return problem(501, "Not Implemented", "Forgot-password API will be implemented in a follow-up.");
    },
  },

  "/api/auth/session": {
    async GET() {
      return json({ authenticated: false });
    },
  },
} as const;
