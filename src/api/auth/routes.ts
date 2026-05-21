import {
  handleLogin,
  handleLogout,
  handleRegister,
  handleResetPassword,
  handleSession,
} from "./handlers";

/**
 * Authentication API routes (JSON). Public auth UI is served separately under /login, etc.
 */
export const authRoutes = {
  "/api/auth/login": {
    POST: handleLogin,
  },

  "/api/auth/logout": {
    POST: handleLogout,
  },

  "/api/auth/register": {
    POST: handleRegister,
  },

  "/api/auth/reset-password": {
    POST: handleResetPassword,
  },

  "/api/auth/forgot-password": {
    POST: handleResetPassword,
  },

  "/api/auth/session": {
    GET: handleSession,
  },
} as const;
