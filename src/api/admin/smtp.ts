/**
 * SMTP Configuration Admin API
 */

import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import {
  loadSMTPConfig,
  saveSMTPConfig,
  getSMTPConfigMasked,
  validateSMTPConfig,
  deleteSMTPConfig,
} from "@z0/utils/email/smtp-config";
import { emailService } from "@z0/utils/email";
import {
  Logger,
  ErrorResponseBuilder,
  RequestContext,
  SecurityLogger,
} from "@z0/utils/error-handling";

const SMTPAdminRoutes = new Hono();

// Schema for SMTP configuration
const SMTP_CONFIG_SCHEMA = z.object({
  host: z.string().min(1, "SMTP host is required"),
  port: z.number().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  fromName: z.string().min(1, "From name is required"),
  fromEmail: z.string().email("Valid from email is required"),
});

/**
 * GET /config
 * Get current SMTP configuration (password masked)
 */
SMTPAdminRoutes.get("/config", async (c) => {
  const requestId = RequestContext.generateRequestId();

  try {
    const config = getSMTPConfigMasked();

    return c.json({
      success: true,
      data: config,
      requestId,
    });
  } catch (error) {
    Logger.error("Failed to get SMTP config", { error, requestId });
    return c.json(
      ErrorResponseBuilder.internal("Failed to get SMTP configuration"),
      500
    );
  }
});

/**
 * POST /configure
 * Save SMTP configuration
 */
SMTPAdminRoutes.post(
  "/configure",
  validator("json", (value, c) => {
    const parsed = SMTP_CONFIG_SCHEMA.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid SMTP configuration",
          parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
            code: i.code,
          }))
        ),
        400
      );
    }
    return parsed.data;
  }),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const data = c.req.valid("json");

    Logger.info("Saving SMTP configuration", { requestId });

    try {
      const config = {
        host: data.host,
        port: data.port,
        secure: data.secure,
        auth: {
          user: data.username,
          password: data.password,
        },
        from: {
          name: data.fromName,
          email: data.fromEmail,
        },
      };

      // Validate configuration
      const validation = validateSMTPConfig(config);
      if (!validation.valid) {
        return c.json(
          ErrorResponseBuilder.validation("Invalid SMTP configuration",
            validation.errors.map((err, i) => ({
              field: `config_${i}`,
              message: err,
              code: "invalid",
            }))
          ),
          400
        );
      }

      // Save configuration
      saveSMTPConfig(config);

      // Reinitialize email service with new config
      emailService.reinitialize();

      SecurityLogger.logAuthenticationEvent(
        "SMTP configuration updated",
        c,
        undefined,
        { requestId }
      );

      Logger.info("SMTP configuration saved", { requestId });

      return c.json({
        success: true,
        message: "SMTP configuration saved successfully",
        requestId,
      });
    } catch (error) {
      Logger.error("Failed to save SMTP config", { error, requestId });
      return c.json(
        ErrorResponseBuilder.internal("Failed to save SMTP configuration"),
        500
      );
    }
  }
);

/**
 * POST /test
 * Send a test email
 */
SMTPAdminRoutes.post(
  "/test",
  validator("json", (value, c) => {
    const schema = z.object({
      recipientEmail: z.string().email("Valid email is required"),
    });
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid request",
          parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
            code: i.code,
          }))
        ),
        400
      );
    }
    return parsed.data;
  }),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const { recipientEmail } = c.req.valid("json");

    Logger.info("Sending test email", { recipientEmail, requestId });

    try {
      // Check if SMTP is configured
      const config = loadSMTPConfig();
      if (!config) {
        return c.json(
          {
            success: false,
            message: "SMTP is not configured. Please configure SMTP settings first.",
            requestId,
          },
          400
        );
      }

      // Send test email
      const result = await emailService.sendTest(recipientEmail);

      if (result.success) {
        Logger.info("Test email sent successfully", { recipientEmail, requestId });
        return c.json({
          success: true,
          message: `Test email sent successfully to ${recipientEmail}`,
          messageId: result.messageId,
          requestId,
        });
      } else {
        Logger.warn("Test email failed", { recipientEmail, error: result.error, requestId });
        return c.json(
          {
            success: false,
            message: `Failed to send test email: ${result.error}`,
            requestId,
          },
          400
        );
      }
    } catch (error) {
      Logger.error("Failed to send test email", { error, requestId });
      return c.json(
        {
          success: false,
          message: error instanceof Error ? error.message : "Failed to send test email",
          requestId,
        },
        500
      );
    }
  }
);

/**
 * DELETE /config
 * Delete SMTP configuration
 */
SMTPAdminRoutes.delete("/config", async (c) => {
  const requestId = RequestContext.generateRequestId();

  try {
    const deleted = deleteSMTPConfig();

    if (deleted) {
      // Reinitialize email service (will be disabled)
      emailService.reinitialize();

      SecurityLogger.logAuthenticationEvent(
        "SMTP configuration deleted",
        c,
        undefined,
        { requestId }
      );

      Logger.info("SMTP configuration deleted", { requestId });

      return c.json({
        success: true,
        message: "SMTP configuration deleted successfully",
        requestId,
      });
    } else {
      return c.json(
        {
          success: false,
          message: "Failed to delete SMTP configuration",
          requestId,
        },
        500
      );
    }
  } catch (error) {
    Logger.error("Failed to delete SMTP config", { error, requestId });
    return c.json(
      ErrorResponseBuilder.internal("Failed to delete SMTP configuration"),
      500
    );
  }
});

export default SMTPAdminRoutes;
