/**
 * Email Types for z0-auth
 * Defines all types for the email system
 */

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean; // true for 465, false for other ports (STARTTLS)
  auth: {
    user: string;
    password: string;
  };
  from: {
    name: string;
    email: string;
  };
  // Optional settings
  connectionTimeout?: number; // ms, default 30000
  responseTimeout?: number; // ms, default 30000
  poolSize?: number; // connection pool size, default 5
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: Date;
}

export interface EmailTemplateData {
  [key: string]: unknown;
}

export type EmailTemplateType =
  | "verification"
  | "password-reset"
  | "welcome"
  | "login-alert"
  | "invite"
  | "password-changed"
  | "account-locked";

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}
