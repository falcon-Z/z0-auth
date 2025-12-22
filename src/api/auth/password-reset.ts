/**
 * Password Reset API Endpoints
 */

import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { db } from "@z0/utils/db/client";
import { emailService } from "@z0/utils/email";
import { hashPassword } from "@z0/utils/auth";
import {
  Logger,
  DatabaseErrorHandler,
  ErrorResponseBuilder,
  RequestContext,
  SecurityLogger,
} from "@z0/utils/error-handling";
import { validatePassword } from "@z0/utils/password-validation";
import { AuditLogger } from "@z0/utils/audit-logger";

const PasswordResetRoutes = new Hono();

// Token expiration time (1 hour)
const TOKEN_EXPIRY_MINUTES = 60;

/**
 * Generate a secure random token
 */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Get the reset URL
 */
function getResetUrl(token: string): string {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/auth/reset-password?token=${token}`;
}

// Schema for forgot password request
const FORGOT_PASSWORD_SCHEMA = z.object({
  email: z.string().email("Invalid email address"),
});

// Schema for reset password request
const RESET_PASSWORD_SCHEMA = z.object({
  token: z.string().min(32, "Invalid token"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

/**
 * POST /forgot-password
 * Request a password reset email
 */
PasswordResetRoutes.post(
  "/forgot-password",
  validator("json", (value, c) => {
    const parsed = FORGOT_PASSWORD_SCHEMA.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid request data",
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
    const clientInfo = RequestContext.getClientInfo(c);
    const { email } = c.req.valid("json");

    Logger.info("Password reset requested", { email: email.substring(0, 3) + "***", requestId });

    try {
      // Always return success to prevent email enumeration
      const successResponse = {
        success: true,
        message: "If an account exists with this email, a password reset link will be sent.",
        requestId,
      };

      // Find user (check both User and PlatformManager)
      let user = await db.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true },
      });

      let userType: "user" | "platform_manager" = "user";

      if (!user) {
        // Check PlatformManager
        const platformManager = await db.platformManager.findUnique({
          where: { email },
          select: { id: true, email: true, name: true },
        });

        if (platformManager) {
          user = platformManager;
          userType = "platform_manager";
        }
      }

      if (!user) {
        // User not found, but return success anyway to prevent enumeration
        Logger.info("Password reset for non-existent email", { requestId });
        return c.json(successResponse, 200);
      }

      // Invalidate any existing unused tokens for this user
      await db.passwordReset.updateMany({
        where: {
          userId: user.id,
          used: false,
        },
        data: {
          used: true,
        },
      });

      // Generate new token
      const token = generateToken();
      const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

      await db.passwordReset.create({
        data: {
          userId: user.id,
          token,
          expiresAt,
        },
      });

      // Send password reset email
      const resetUrl = getResetUrl(token);
      const emailResult = await emailService.sendPasswordReset(user.email, {
        userName: user.name,
        resetUrl,
        expiresInMinutes: TOKEN_EXPIRY_MINUTES,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
      });

      if (!emailResult.success) {
        Logger.error("Failed to send password reset email", {
          userId: user.id,
          error: emailResult.error,
          requestId,
        });
      }

      SecurityLogger.logAuthenticationEvent(
        "Password reset requested",
        c,
        user.id,
        { requestId, userType }
      );

      // Log audit trail
      await AuditLogger.logAuth(
        "PASSWORD_RESET_REQUESTED",
        c,
        user.id,
        user.email,
        {
          actorType: userType === "platform_manager" ? "platform_manager" : "user",
          severity: "MEDIUM",
          metadata: {
            resetUrl: resetUrl.replace(token, "***"),
            expiresAt: expiresAt.toISOString()
          }
        }
      );

      Logger.info("Password reset email sent", { userId: user.id, requestId });

      return c.json(successResponse, 200);
    } catch (error) {
      const dbError = DatabaseErrorHandler.handleError(error);
      Logger.error("Forgot password error", {
        error: dbError.message,
        requestId,
      });
      // Still return success to prevent enumeration
      return c.json(
        {
          success: true,
          message: "If an account exists with this email, a password reset link will be sent.",
          requestId,
        },
        200
      );
    }
  }
);

/**
 * GET /reset-password/:token
 * Validate reset token (used by UI to check if token is valid before showing form)
 */
PasswordResetRoutes.get("/reset-password/:token", async (c) => {
  const requestId = RequestContext.generateRequestId();
  const token = c.req.param("token");

  if (!token || token.length < 32) {
    return c.json(
      {
        valid: false,
        message: "Invalid reset token",
        code: "INVALID_TOKEN",
        requestId,
      },
      400
    );
  }

  try {
    const resetToken = await db.passwordReset.findUnique({
      where: { token },
      select: { id: true, used: true, expiresAt: true },
    });

    if (!resetToken) {
      return c.json(
        {
          valid: false,
          message: "Reset token not found",
          code: "TOKEN_NOT_FOUND",
          requestId,
        },
        404
      );
    }

    if (resetToken.used) {
      return c.json(
        {
          valid: false,
          message: "This reset link has already been used",
          code: "TOKEN_ALREADY_USED",
          requestId,
        },
        400
      );
    }

    if (resetToken.expiresAt < new Date()) {
      return c.json(
        {
          valid: false,
          message: "This reset link has expired. Please request a new one.",
          code: "TOKEN_EXPIRED",
          requestId,
        },
        400
      );
    }

    return c.json(
      {
        valid: true,
        message: "Token is valid",
        requestId,
      },
      200
    );
  } catch (error) {
    const dbError = DatabaseErrorHandler.handleError(error);
    return c.json(
      {
        valid: false,
        message: "Failed to validate token",
        code: "VALIDATION_ERROR",
        requestId,
      },
      500
    );
  }
});

/**
 * POST /reset-password
 * Reset password with token
 */
PasswordResetRoutes.post(
  "/reset-password",
  validator("json", (value, c) => {
    const parsed = RESET_PASSWORD_SCHEMA.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid request data",
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
    const { token, password } = c.req.valid("json");

    try {
      // Validate password strength
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        return c.json(
          ErrorResponseBuilder.validation("Password does not meet requirements", [
            { field: "password", message: passwordValidation.feedback, code: "weak_password" },
          ]),
          400
        );
      }

      // Find the token
      const resetToken = await db.passwordReset.findUnique({
        where: { token },
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
        },
      });

      if (!resetToken) {
        return c.json(
          ErrorResponseBuilder.notFound("Reset token not found"),
          404
        );
      }

      if (resetToken.used) {
        return c.json(
          {
            success: false,
            message: "This reset link has already been used",
            code: "TOKEN_ALREADY_USED",
            requestId,
          },
          400
        );
      }

      if (resetToken.expiresAt < new Date()) {
        return c.json(
          {
            success: false,
            message: "This reset link has expired. Please request a new one.",
            code: "TOKEN_EXPIRED",
            requestId,
          },
          400
        );
      }

      // Hash new password
      const hashedPassword = await hashPassword(password);

      // Update password and mark token as used
      await db.$transaction([
        db.passwordReset.update({
          where: { id: resetToken.id },
          data: { used: true },
        }),
        db.user.update({
          where: { id: resetToken.userId },
          data: { password: hashedPassword },
        }),
      ]);

      SecurityLogger.logAuthenticationEvent(
        "Password reset completed",
        c,
        resetToken.userId,
        { requestId }
      );

      // Log audit trail
      await AuditLogger.logAuth(
        "PASSWORD_RESET_COMPLETED",
        c,
        resetToken.userId,
        resetToken.user?.email,
        {
          actorType: "user", // Assuming regular user, platform managers should use admin panel
          severity: "HIGH",
          metadata: {
            tokenUsed: true
          }
        }
      );

      Logger.info("Password reset completed", {
        userId: resetToken.userId,
        requestId,
      });

      // Optionally send confirmation email
      // await emailService.sendPasswordChanged(resetToken.user.email, {
      //   userName: resetToken.user.name,
      // });

      return c.json(
        {
          success: true,
          message: "Password has been reset successfully. You can now login with your new password.",
          requestId,
        },
        200
      );
    } catch (error) {
      const dbError = DatabaseErrorHandler.handleError(error);
      Logger.error("Reset password error", {
        error: dbError.message,
        requestId,
      });
      return c.json(
        ErrorResponseBuilder.database("Failed to reset password", dbError.code),
        500
      );
    }
  }
);

export default PasswordResetRoutes;
