import {
  handleLogin,
  handleLogout,
  handleRegister,
  handlePasswordResetUnavailable,
  handleSession,
} from "./handlers";

/**
 * Authentication API routes (JSON). Public auth UI is served separately under /login, etc.
 */
export const authApiRoutes = {
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
    POST: handlePasswordResetUnavailable,
  },

  "/api/auth/forgot-password": {
    POST: handlePasswordResetUnavailable,
  },

  "/api/auth/session": {
    GET: handleSession,
  },
} as const;
