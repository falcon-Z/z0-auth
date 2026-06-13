import {
  handleChangePassword,
  handleLogin,
  handleLogout,
  handleForgotPassword,
  handleResetPassword,
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

  "/api/auth/reset-password": {
    POST: handleResetPassword,
  },

  "/api/auth/forgot-password": {
    POST: handleForgotPassword,
  },

  "/api/auth/session": {
    GET: handleSession,
  },

  "/api/auth/change-password": {
    POST: handleChangePassword,
  },
} as const;
