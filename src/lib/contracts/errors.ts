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
  /** Active organization is not in the user's memberships. */
  TENANT_ACCESS_DENIED: "tenant_access_denied",
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
  /** Invalid or unknown role key for assignment. */
  INVALID_ROLE: "invalid_role",
  /** Target user does not exist. */
  USER_NOT_FOUND: "user_not_found",
  /** Operator cannot disable their own account. */
  CANNOT_DISABLE_SELF: "cannot_disable_self",
  /** Cannot disable the last active platform administrator. */
  LAST_PLATFORM_ADMIN: "last_platform_admin",
  /** Cannot remove or demote the last organization administrator. */
  LAST_TENANT_ADMIN: "last_tenant_admin",
  /** Actor cannot assign the requested tenant role keys. */
  ROLE_ASSIGNMENT_DENIED: "role_assignment_denied",
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
