/**
 * Email Module
 * Exports all email-related functionality
 */

// Main service
export {
  emailService,
  isSMTPConfigured,
  loadSMTPConfig,
  type VerificationEmailData,
  type PasswordResetEmailData,
  type WelcomeEmailData,
  type LoginAlertEmailData,
} from "./email-service";

// SMTP Client (for direct usage)
export { SMTPClient, createSMTPClient } from "./smtp-client";

// SMTP Config management
export {
  saveSMTPConfig,
  getSMTPConfigMasked,
  deleteSMTPConfig,
  validateSMTPConfig,
} from "./smtp-config";

// Types
export type {
  SMTPConfig,
  EmailMessage,
  SendEmailResult,
  EmailTemplateData,
  EmailTemplateType,
  EmailTemplate,
} from "./types";

// Templates (for custom usage)
export { verificationTemplate } from "./templates/verification";
export { passwordResetTemplate } from "./templates/password-reset";
export { welcomeTemplate } from "./templates/welcome";
export { loginAlertTemplate } from "./templates/login-alert";
export { baseTemplate, createButton, createCodeDisplay, createInfoBox } from "./templates/base";
