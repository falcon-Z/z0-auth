import {
  handleChangePassword,
  handleLogin,
  handleLogout,
  handleForgotPassword,
  handleResetPassword,
  handleSession,
} from "./handlers";
import {
  handleConfirmMfaEnrollment,
  handleCompleteMfaChallenge,
  handleDisableMfa,
  handleGetMfaStatus,
  handleRegenerateRecoveryCodes,
  handleStartMfaEnrollment,
  handleMfaStepUp,
  handleListRememberedBrowsers,
  handleRevokeRememberedBrowser,
} from "./mfa-handlers";
import {
  handleFinishPasskeyAuthentication,
  handleFinishPasskeyRegistration,
  handleListPasskeys,
  handleRemovePasskey,
  handleRenamePasskey,
  handleStartPasskeyAuthentication,
  handleStartPasskeyRegistration,
} from "./passkey-handlers";

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

  "/api/auth/mfa": {
    GET: handleGetMfaStatus,
    DELETE: handleDisableMfa,
  },

  "/api/auth/mfa/enrollment": {
    POST: handleStartMfaEnrollment,
  },

  "/api/auth/mfa/enrollment/confirm": {
    POST: handleConfirmMfaEnrollment,
  },

  "/api/auth/mfa/recovery-codes": {
    POST: handleRegenerateRecoveryCodes,
  },

  "/api/auth/mfa/challenge": {
    POST: handleCompleteMfaChallenge,
  },

  "/api/auth/mfa/step-up": {
    POST: handleMfaStepUp,
  },

  "/api/auth/mfa/remembered-browsers": {
    GET: handleListRememberedBrowsers,
    DELETE: handleRevokeRememberedBrowser,
  },

  "/api/auth/passkeys": {
    GET: handleListPasskeys,
  },

  "/api/auth/passkeys/registration/options": {
    POST: handleStartPasskeyRegistration,
  },

  "/api/auth/passkeys/registration/verify": {
    POST: handleFinishPasskeyRegistration,
  },

  "/api/auth/passkeys/authentication/options": {
    POST: handleStartPasskeyAuthentication,
  },

  "/api/auth/passkeys/authentication/verify": {
    POST: handleFinishPasskeyAuthentication,
  },

  "/api/auth/passkeys/rename": {
    POST: handleRenamePasskey,
  },

  "/api/auth/passkeys/remove": {
    POST: handleRemovePasskey,
  },
} as const;
