/**
 * Email Verification API Endpoints
 */

import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { db } from "@z0/utils/db/client";
import { emailService } from "@z0/utils/email";
import {
  Logger,
  DatabaseErrorHandler,
  ErrorResponseBuilder,
  RequestContext,
} from "@z0/utils/error-handling";
import { verifyAccessTokenMiddleware, type TokenPayload } from "@z0/utils/auth";
import { AuditLogger } from "@z0/utils/audit-logger";

const VerificationRoutes = new Hono();

// Token expiration time (24 hours)
const TOKEN_EXPIRY_HOURS = 24;

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
 * Get the verification URL
 */
function getVerificationUrl(token: string): string {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/auth/verify-email?token=${token}`;
}

// Schema for send verification request
const SEND_VERIFICATION_SCHEMA = z.object({
  email: z.string().email().optional(),
});

/**
 * POST /send-verification
 * Send or resend verification email
 * Requires authentication OR email parameter for resend
 */
VerificationRoutes.post(
  "/send-verification",
  validator("json", (value, c) => {
    const parsed = SEND_VERIFICATION_SCHEMA.safeParse(value);
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
    const { email: providedEmail } = c.req.valid("json");

    try {
      let user;

      // Try to get user from auth context first
      const authUser = c.get("user") as { userId: string } | undefined;

      if (authUser?.userId) {
        // Authenticated user requesting verification
        user = await db.user.findUnique({
          where: { id: authUser.userId },
          select: { id: true, email: true, name: true, emailVerified: true },
        });
      } else if (providedEmail) {
        // Email provided for resend (rate limit this in production)
        user = await db.user.findUnique({
          where: { email: providedEmail },
          select: { id: true, email: true, name: true, emailVerified: true },
        });
      } else {
        return c.json(
          ErrorResponseBuilder.validation(
            "Email is required when not authenticated",
            [{ field: "email", message: "Email is required", code: "required" }]
          ),
          400
        );
      }

      if (!user) {
        // Don't reveal if user exists or not for security
        return c.json(
          {
            success: true,
            message: "If an account exists with this email, a verification link will be sent.",
            requestId,
          },
          200
        );
      }

      if (user.emailVerified) {
        return c.json(
          {
            success: true,
            message: "Email is already verified",
            verified: true,
            requestId,
          },
          200
        );
      }

      // Invalidate any existing unused tokens
      await db.emailVerificationToken.updateMany({
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
      const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

      await db.emailVerificationToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt,
        },
      });

      // Send verification email
      const verificationUrl = getVerificationUrl(token);
      const emailResult = await emailService.sendVerification(user.email, {
        userName: user.name,
        verificationUrl,
        expiresInHours: TOKEN_EXPIRY_HOURS,
      });

      if (!emailResult.success) {
        Logger.error("Failed to send verification email", {
          userId: user.id,
          error: emailResult.error,
          requestId,
        });
      }

      Logger.info("Verification email sent", {
        userId: user.id,
        requestId,
      });

      return c.json(
        {
          success: true,
          message: "Verification email sent. Please check your inbox.",
          requestId,
        },
        200
      );
    } catch (error) {
      const dbError = DatabaseErrorHandler.handleError(error);
      Logger.error("Send verification error", {
        error: dbError.message,
        requestId,
      });
      return c.json(
        ErrorResponseBuilder.database("Failed to send verification email", dbError.code),
        500
      );
    }
  }
);

/**
 * GET /verify-email/:token
 * Verify email with token
 */
VerificationRoutes.get("/verify-email/:token", async (c) => {
  const requestId = RequestContext.generateRequestId();
  const token = c.req.param("token");

  if (!token || token.length < 32) {
    return c.json(
      ErrorResponseBuilder.validation("Invalid verification token", [
        { field: "token", message: "Token is required and must be valid", code: "invalid" },
      ]),
      400
    );
  }

  try {
    // Find the token
    const verificationToken = await db.emailVerificationToken.findUnique({
      where: { token },
      include: {
        user: {
          select: { id: true, email: true, name: true, emailVerified: true },
        },
      },
    });

    if (!verificationToken) {
      return c.json(
        ErrorResponseBuilder.notFound("Verification token not found or already used"),
        404
      );
    }

    if (verificationToken.used) {
      return c.json(
        {
          success: false,
          message: "This verification link has already been used",
          code: "TOKEN_ALREADY_USED",
          requestId,
        },
        400
      );
    }

    if (verificationToken.expiresAt < new Date()) {
      return c.json(
        {
          success: false,
          message: "This verification link has expired. Please request a new one.",
          code: "TOKEN_EXPIRED",
          requestId,
        },
        400
      );
    }

    // Mark token as used and verify email
    await db.$transaction([
      db.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { used: true },
      }),
      db.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerified: true },
      }),
    ]);

    // Log audit trail
    await AuditLogger.logAuth(
      "EMAIL_VERIFIED",
      c,
      verificationToken.userId,
      verificationToken.user.email,
      {
        actorType: "user",
        severity: "MEDIUM",
        metadata: {
          tokenUsed: true,
          verifiedAt: new Date().toISOString()
        }
      }
    );

    Logger.info("Email verified", {
      userId: verificationToken.userId,
      requestId,
    });

    // Send welcome email
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    await emailService.sendWelcome(verificationToken.user.email, {
      userName: verificationToken.user.name,
      dashboardUrl: `${appUrl}/dashboard`,
    });

    return c.json(
      {
        success: true,
        message: "Email verified successfully",
        user: {
          id: verificationToken.user.id,
          email: verificationToken.user.email,
          name: verificationToken.user.name,
        },
        requestId,
      },
      200
    );
  } catch (error) {
    const dbError = DatabaseErrorHandler.handleError(error);
    Logger.error("Verify email error", {
      error: dbError.message,
      requestId,
    });
    return c.json(
      ErrorResponseBuilder.database("Failed to verify email", dbError.code),
      500
    );
  }
});

/**
 * GET /verification-status
 * Check if current user's email is verified
 * Requires authentication
 */
VerificationRoutes.get("/verification-status", verifyAccessTokenMiddleware, async (c) => {
  const requestId = RequestContext.generateRequestId();
  const authUser = c.get("user") as { userId: string } | undefined;

  if (!authUser?.userId) {
    return c.json(
      ErrorResponseBuilder.authentication("Authentication required", "UNAUTHORIZED"),
      401
    );
  }

  try {
    const user = await db.user.findUnique({
      where: { id: authUser.userId },
      select: { id: true, email: true, emailVerified: true },
    });

    if (!user) {
      return c.json(ErrorResponseBuilder.notFound("User not found"), 404);
    }

    return c.json(
      {
        success: true,
        verified: user.emailVerified,
        email: user.email,
        requestId,
      },
      200
    );
  } catch (error) {
    const dbError = DatabaseErrorHandler.handleError(error);
    return c.json(
      ErrorResponseBuilder.database("Failed to check verification status", dbError.code),
      500
    );
  }
});

export default VerificationRoutes;
