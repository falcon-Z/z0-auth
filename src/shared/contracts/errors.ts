export type FieldError = {
  field: string;
  code: string;
  message: string;
};

export type ProblemDetail = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: FieldError[];
};

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
} as const;
