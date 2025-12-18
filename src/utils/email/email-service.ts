/**
 * Email Service
 * High-level API for sending emails using templates
 */

import { SMTPClient, createSMTPClient } from "./smtp-client";
import { loadSMTPConfig, isSMTPConfigured } from "./smtp-config";
import type { SMTPConfig, EmailMessage, SendEmailResult } from "./types";
import { verificationTemplate, type VerificationEmailData } from "./templates/verification";
import { passwordResetTemplate, type PasswordResetEmailData } from "./templates/password-reset";
import { welcomeTemplate, type WelcomeEmailData } from "./templates/welcome";
import { loginAlertTemplate, type LoginAlertEmailData } from "./templates/login-alert";

class EmailService {
  private client: SMTPClient | null = null;
  private initialized = false;

  /**
   * Initialize the email service with SMTP configuration
   */
  async initialize(config?: SMTPConfig): Promise<boolean> {
    const smtpConfig = config ?? loadSMTPConfig();

    if (!smtpConfig) {
      console.warn("[Email Service] No SMTP configuration found. Emails will be logged to console.");
      this.initialized = false;
      return false;
    }

    this.client = new SMTPClient(smtpConfig);
    this.initialized = true;

    // Test the connection
    const testResult = await this.client.testConnection();
    if (!testResult.success) {
      console.error("[Email Service] SMTP connection test failed:", testResult.error);
      return false;
    }

    console.log("[Email Service] Initialized successfully");
    return true;
  }

  /**
   * Check if the email service is ready to send emails
   */
  isReady(): boolean {
    return this.initialized && this.client !== null;
  }

  /**
   * Send a raw email message
   */
  async send(message: EmailMessage): Promise<SendEmailResult> {
    // If not initialized, try to initialize
    if (!this.initialized) {
      await this.initialize();
    }

    // If still not ready, log to console in development
    if (!this.client) {
      console.log("[Email Service] Would send email:");
      console.log(`  To: ${Array.isArray(message.to) ? message.to.join(", ") : message.to}`);
      console.log(`  Subject: ${message.subject}`);
      console.log(`  Preview: ${message.text?.substring(0, 200) ?? message.html.substring(0, 200)}...`);

      return {
        success: true,
        messageId: `dev-${Date.now()}`,
        timestamp: new Date(),
      };
    }

    return this.client.send(message);
  }

  /**
   * Send email verification email
   */
  async sendVerificationEmail(data: VerificationEmailData): Promise<SendEmailResult> {
    const template = verificationTemplate(data);
    const email = this.extractEmailFromUrl(data.verificationUrl);

    return this.send({
      to: email ?? data.verificationUrl.split("email=")[1]?.split("&")[0] ?? "",
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send verification email to a specific address
   */
  async sendVerification(
    to: string,
    data: Omit<VerificationEmailData, "verificationUrl"> & { verificationUrl: string }
  ): Promise<SendEmailResult> {
    const template = verificationTemplate(data);

    return this.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(
    to: string,
    data: PasswordResetEmailData
  ): Promise<SendEmailResult> {
    const template = passwordResetTemplate(data);

    return this.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcome(to: string, data: WelcomeEmailData): Promise<SendEmailResult> {
    const template = welcomeTemplate(data);

    return this.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send login alert email
   */
  async sendLoginAlert(to: string, data: LoginAlertEmailData): Promise<SendEmailResult> {
    const template = loginAlertTemplate(data);

    return this.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Test SMTP connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.client) {
      const config = loadSMTPConfig();
      if (!config) {
        return { success: false, error: "No SMTP configuration found" };
      }
      this.client = new SMTPClient(config);
    }

    return this.client.testConnection();
  }

  /**
   * Update SMTP configuration
   */
  async updateConfig(config: SMTPConfig): Promise<boolean> {
    this.client = new SMTPClient(config);
    this.initialized = true;

    const testResult = await this.client.testConnection();
    return testResult.success;
  }

  private extractEmailFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get("email");
    } catch {
      return null;
    }
  }
}

// Singleton instance
export const emailService = new EmailService();

// Export types
export type {
  VerificationEmailData,
  PasswordResetEmailData,
  WelcomeEmailData,
  LoginAlertEmailData,
};

// Re-export for convenience
export { isSMTPConfigured, loadSMTPConfig };
