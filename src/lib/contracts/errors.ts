export type FieldError = {
  field: string;
  code: string;
  message: string;
};

export type ProblemDetail = {
  type: string;
  title: string;
  status: number;
  requestId: string;
  detail?: string;
  errors?: FieldError[];
  code?: string;
  retryAfter?: number;
  allowed?: string[];
};

/** Machine-readable codes returned in `errors[].code` or top-level `code`. */
export const ErrorCodes = {
  REQUIRED: "required",
  TOO_LONG: "too_long",
  INVALID_EMAIL: "invalid_email",
  PASSWORD_POLICY: "password_policy",
  PASSWORD_MISMATCH: "password_mismatch",
  SETUP_COMPLETE: "setup_complete",
  INVALID_CREDENTIALS: "invalid_credentials",
  CSRF_INVALID: "csrf_invalid",
  RATE_LIMITED: "rate_limited",
  INSTALL_TOKEN_REQUIRED: "install_token_required",
  INSTALL_TOKEN_INVALID: "install_token_invalid",
  PASSWORD_RESET_UNAVAILABLE: "password_reset_unavailable",
  /** Password reset token unknown, used, or expired. */
  RESET_TOKEN_INVALID: "reset_token_invalid",
  SMTP_NOT_CONFIGURED: "smtp_not_configured",
  SMTP_DELIVERY_FAILED: "smtp_delivery_failed",
  /** Postgres unreachable or connection dropped. */
  DATABASE_UNAVAILABLE: "database_unavailable",
  /** OAuth: redirect_uri must match a registered value exactly (see security-contract.md). */
  INVALID_REDIRECT_URI: "invalid_redirect_uri",
  /** OAuth: requested scopes must be a subset of client-allowed scopes. */
  INVALID_SCOPE: "invalid_scope",
  /** OAuth: public clients must send PKCE S256. */
  PKCE_REQUIRED: "pkce_required",
  /** OAuth: unknown or disabled client_id. */
  INVALID_CLIENT: "invalid_client",
  /** OAuth: client not permitted for this grant or redirect. */
  UNAUTHORIZED_CLIENT: "unauthorized_client",
  /** Caller lacks permission for this action. */
  PERMISSION_DENIED: "permission_denied",
  /** Invite token unknown or not pending. */
  INVITE_INVALID: "invite_invalid",
  /** Invite past expires_at. */
  INVITE_EXPIRED: "invite_expired",
  /** Signed-in user email does not match the invite. */
  INVITE_EMAIL_MISMATCH: "invite_email_mismatch",
  /** User is already a member of the organization. */
  INVITE_ALREADY_MEMBER: "invite_already_member",
  /** Target user does not exist. */
  USER_NOT_FOUND: "user_not_found",
  /** Session id not found or not active for the current user. */
  SESSION_NOT_FOUND: "session_not_found",
  /** Organization slug format is invalid. */
  INVALID_SLUG: "invalid_slug",
  /** Organization slug is already in use. */
  SLUG_TAKEN: "slug_taken",
  /** Application id is unknown. */
  APP_NOT_FOUND: "app_not_found",
  /** Credential id is unknown for the application. */
  CREDENTIAL_NOT_FOUND: "credential_not_found",
  /** Application is disabled. */
  APP_DISABLED: "app_disabled",
  /** Cannot revoke the last active credential on an active application. */
  LAST_ACTIVE_CREDENTIAL: "last_active_credential",
  /** Public (SPA) clients do not have rotatable secrets. */
  PUBLIC_CLIENT_NO_SECRET: "public_client_no_secret",
  /** Public apps allow only one active credential. */
  CREDENTIAL_LIMIT_REACHED: "credential_limit_reached",
  /** Scope name already registered for the application. */
  SCOPE_TAKEN: "scope_taken",
  /** Scope id is unknown for the application. */
  SCOPE_NOT_FOUND: "scope_not_found",
  /** User is not registered for this application. */
  APP_USER_NOT_FOUND: "app_user_not_found",
  /** Email already has membership on this application. */
  APP_USER_EXISTS: "app_user_exists",
  /** Optional metadata JSON is invalid or too large. */
  INVALID_METADATA: "invalid_metadata",
  /** Federation provider id is unknown. */
  PROVIDER_NOT_FOUND: "provider_not_found",
  /** Provider key is already registered. */
  PROVIDER_KEY_TAKEN: "provider_key_taken",
  /** Provider is still enabled on one or more apps. */
  PROVIDER_IN_USE: "provider_in_use",
  /** Federation sign-in could not complete (generic). */
  FEDERATION_FAILED: "federation_failed",
  /** Email from provider conflicts with an existing account. */
  FEDERATION_EMAIL_CONFLICT: "federation_email_conflict",
  /** Stored upstream provider token expired. */
  FEDERATION_TOKEN_EXPIRED: "federation_token_expired",
  /** Upstream provider rejected a token refresh. */
  FEDERATION_TOKEN_REFRESH_FAILED: "federation_token_refresh_failed",
  /** Application already belongs to another service group. */
  APP_ALREADY_GROUPED: "app_already_grouped",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Builds the JSON body for RFC 7807-style API errors (see `docs/api/references/common.openapi.yaml`). */
export function createProblemDetail(
  status: number,
  title: string,
  detail?: string,
  extra?: Record<string, unknown>,
): ProblemDetail {
  return {
    type: "about:blank",
    title,
    status,
    detail,
    ...extra,
    requestId: crypto.randomUUID(),
  };
}
