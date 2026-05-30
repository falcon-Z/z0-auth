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
