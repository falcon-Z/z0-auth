export type SmtpEncryption = "none" | "starttls" | "tls";

export type SmtpSettingsSource = "database" | "env";

export type EmailSettingsResponse = {
  configured: boolean;
  enabled: boolean;
  source: SmtpSettingsSource;
  readOnly: boolean;
  host: string;
  port: number;
  encryption: SmtpEncryption;
  username: string | null;
  hasPassword: boolean;
  fromAddress: string;
  fromName: string | null;
  verifiedAt: string | null;
  updatedAt: string | null;
};

export type PutEmailSettingsRequest = {
  host: string;
  port: number;
  encryption: SmtpEncryption;
  username?: string | null;
  /** Omit or empty string to keep existing password. */
  password?: string | null;
  fromAddress: string;
  fromName?: string | null;
  enabled: boolean;
};

export type TestEmailRequest = {
  to: string;
};

export type TestEmailResponse = {
  ok: true;
  verifiedAt: string;
};

export type ForgotPasswordRequest = {
  email: string;
  /** When set, reset is scoped to an app end-user account (not console). */
  clientId?: string;
};

export type ForgotPasswordResponse = {
  ok: true;
  message: string;
};

export type ResetPasswordRequest = {
  token: string;
  password: string;
  passwordConfirm: string;
  /** When set, completes reset for an app end-user account. */
  clientId?: string;
};

export type ResetPasswordResponse = {
  ok: true;
};
