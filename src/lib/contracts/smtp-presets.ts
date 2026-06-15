import type { SmtpEncryption } from "@z0/contracts/email-settings";

export type SmtpProviderPresetId = "google" | "microsoft" | "sendgrid" | "ses" | "custom";

export type SmtpProviderPreset = {
  id: SmtpProviderPresetId;
  label: string;
  host: string;
  port: number;
  encryption: SmtpEncryption;
  hint?: string;
};

export const SMTP_PROVIDER_PRESETS: SmtpProviderPreset[] = [
  {
    id: "google",
    label: "Google Workspace / Gmail",
    host: "smtp.gmail.com",
    port: 587,
    encryption: "starttls",
    hint: "Use an app password when two-factor authentication is enabled.",
  },
  {
    id: "microsoft",
    label: "Microsoft 365",
    host: "smtp.office365.com",
    port: 587,
    encryption: "starttls",
  },
  {
    id: "sendgrid",
    label: "SendGrid",
    host: "smtp.sendgrid.net",
    port: 587,
    encryption: "starttls",
    hint: "Username is literally apikey; password is your API key.",
  },
  {
    id: "ses",
    label: "Amazon SES",
    host: "email-smtp.us-east-1.amazonaws.com",
    port: 587,
    encryption: "starttls",
    hint: "Use the SMTP endpoint for your AWS region.",
  },
  {
    id: "custom",
    label: "Custom",
    host: "",
    port: 587,
    encryption: "starttls",
  },
];

export function smtpPresetById(id: string): SmtpProviderPreset | undefined {
  return SMTP_PROVIDER_PRESETS.find((preset) => preset.id === id);
}
