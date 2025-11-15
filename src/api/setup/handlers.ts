/**
 * Setup API Handlers
 * Schema-driven approach using Zod for validation
 * Provides endpoints for:
 * - Setup eligibility check
 * - Email validation
 * - Organization name validation
 * - Complete super admin setup
 */

import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import {
  type SuperAdminSetupData,
  type ValidateEmailRequest,
  type ValidateOrganizationRequest,
  generateSlug,
} from "./validations";
import { db } from "@z0/utils/db/client";
import {
  hashPassword,
  generateAccessToken,
  generateRefreshToken,
  type AuthResponse,
  parseTimeToSeconds,
} from "@z0/utils/auth";
import { validatePassword } from "@z0/utils/password-validation";
import {
  Logger,
  DatabaseErrorHandler,
  ErrorResponseBuilder,
  SecurityLogger,
  RequestContext,
  type FieldError,
} from "@z0/utils/error-handling";

/**
 * Check if system is eligible for setup
 * Returns whether super admin can be created
 */
export async function checkSetupEligibility(c: Context) {
  const requestId = RequestContext.generateRequestId();
  const clientInfo = RequestContext.getClientInfo(c);

  Logger.info("Setup eligibility check initiated", {
    requestId,
    ...clientInfo,
  });

  try {
    // Check config.json
    const fs = await import("fs/promises");
    const configPath = new URL("../../config.json", import.meta.url).pathname;
    let configuredInFile = false;

    try {
      const configRaw = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configRaw);
      configuredInFile = config.SuperAdminConfigured === true;
    } catch (err) {
      Logger.warn("Failed to read config file", {
        error: err.message,
        requestId,
      });
    }

    // Check database
    let existingAdmin;
    try {
      existingAdmin = await db.platformManager.findFirst({
        where: { roleType: "SUPER_ADMIN" },
        select: { id: true },
      });
    } catch (error) {
      const dbError = DatabaseErrorHandler.handleError(error);
      Logger.error("Database error during eligibility check", {
        error: dbError.message,
        code: dbError.code,
        requestId,
      });

      const errorResponse = ErrorResponseBuilder.database(
        "Failed to check setup status",
        dbError.code,
        dbError.isRetryable
      );
      return c.json({ ...errorResponse, requestId }, 500);
    }

    const configured = configuredInFile || !!existingAdmin;
    const eligible = !configured;

    return c.json({
      eligible,
      configured,
      message: eligible
        ? "System is ready for setup"
        : "Setup has already been completed",
      requestId,
    });
  } catch (error) {
    Logger.error("Unexpected error during eligibility check", {
      error: error.message,
      stack: error.stack,
      requestId,
    });

    const errorResponse = ErrorResponseBuilder.system(
      "Failed to check setup eligibility",
      "UNEXPECTED_ERROR",
      { retryable: true }
    );

    return c.json({ ...errorResponse, requestId }, 500);
  }
}

/**
 * Validate email availability
 * Checks if email is already in use by existing super admin
 */
export async function validateEmail(c: Context) {
  const requestId = RequestContext.generateRequestId();
  const clientInfo = RequestContext.getClientInfo(c);

  Logger.info("Email validation initiated", { requestId, ...clientInfo });

  try {
    const body = (await c.req.json()) as ValidateEmailRequest;
    const { email } = body;

    // Check if super admin with this email exists
    let existingAdmin;
    try {
      existingAdmin = await db.platformManager.findFirst({
        where: {
          email,
          roleType: "SUPER_ADMIN",
        },
        select: { id: true, email: true },
      });
    } catch (error) {
      const dbError = DatabaseErrorHandler.handleError(error);
      Logger.error("Database error during email validation", {
        error: dbError.message,
        code: dbError.code,
        requestId,
      });

      const errorResponse = ErrorResponseBuilder.database(
        "Failed to validate email",
        dbError.code,
        dbError.isRetryable
      );
      return c.json({ ...errorResponse, requestId }, 500);
    }

    const available = !existingAdmin;

    if (!available) {
      SecurityLogger.logSuspiciousActivity(
        "Attempt to use existing super admin email",
        c,
        {
          email,
          existingAdminId: existingAdmin?.id,
          requestId,
        }
      );
    }

    return c.json({
      success: true,
      available,
      email,
      message: available
        ? "Email is available"
        : "This email is already registered",
      requestId,
    });
  } catch (error) {
    Logger.error("Unexpected error during email validation", {
      error: error.message,
      stack: error.stack,
      requestId,
    });

    const errorResponse = ErrorResponseBuilder.system(
      "Failed to validate email",
      "UNEXPECTED_ERROR",
      { retryable: true }
    );

    return c.json({ ...errorResponse, requestId }, 500);
  }
}

/**
 * Validate organization name availability
 * Checks if organization name/slug is available
 */
export async function validateOrganization(c: Context) {
  const requestId = RequestContext.generateRequestId();
  const clientInfo = RequestContext.getClientInfo(c);

  Logger.info("Organization validation initiated", {
    requestId,
    ...clientInfo,
  });

  try {
    const body = (await c.req.json()) as ValidateOrganizationRequest;
    const { name, slug: providedSlug } = body;

    const suggestedSlug = providedSlug || generateSlug(name);

    // Check if organization with this name or slug exists
    let existingOrg;
    try {
      existingOrg = await db.organization.findFirst({
        where: {
          OR: [
            { name: { equals: name, mode: "insensitive" } },
            { slug: suggestedSlug },
          ],
        },
        select: { id: true, name: true, slug: true },
      });
    } catch (error) {
      const dbError = DatabaseErrorHandler.handleError(error);
      Logger.error("Database error during organization validation", {
        error: dbError.message,
        code: dbError.code,
        requestId,
      });

      const errorResponse = ErrorResponseBuilder.database(
        "Failed to validate organization",
        dbError.code,
        dbError.isRetryable
      );
      return c.json({ ...errorResponse, requestId }, 500);
    }

    const available = !existingOrg;

    if (!available) {
      SecurityLogger.logSuspiciousActivity(
        "Attempt to use existing organization name",
        c,
        {
          name,
          slug: suggestedSlug,
          existingOrgId: existingOrg?.id,
          requestId,
        }
      );
    }

    return c.json({
      success: true,
      available,
      name,
      suggestedSlug,
      message: available
        ? "Organization name is available"
        : "This organization name is already taken",
      requestId,
    });
  } catch (error) {
    Logger.error("Unexpected error during organization validation", {
      error: error.message,
      stack: error.stack,
      requestId,
    });

    const errorResponse = ErrorResponseBuilder.system(
      "Failed to validate organization",
      "UNEXPECTED_ERROR",
      { retryable: true }
    );

    return c.json({ ...errorResponse, requestId }, 500);
  }
}

/**
 * Complete super admin setup
 * Creates super admin account and initial organization
 */
export async function handleSetup(c: Context) {
  const requestId = RequestContext.generateRequestId();
  const clientInfo = RequestContext.getClientInfo(c);

  Logger.info("Setup request initiated", { requestId, ...clientInfo });

  try {
    // Parse validated data from Hono's Zod validator
    const data = (await c.req.json()) as SuperAdminSetupData;
    const { email, password, name, organization } = data;

    /**
     * Additional server-side password validation for security
     */
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      SecurityLogger.logSetupAttempt(c, false, {
        reason: "Password validation failed",
        passwordFeedback: passwordValidation.feedback,
        requestId,
      });

      const fieldErrors: FieldError[] = [
        {
          field: "password",
          message: "Password does not meet security requirements",
          code: "PASSWORD_WEAK",
        },
      ];

      const errorResponse = ErrorResponseBuilder.validation(
        "Password does not meet security requirements",
        fieldErrors,
        { feedback: passwordValidation.feedback }
      );

      return c.json({ ...errorResponse, requestId }, 400);
    }

    /**
     * Check if a super admin already exists in the database.
     */
    let existing;
    try {
      existing = await db.platformManager.findFirst({
        where: { roleType: "SUPER_ADMIN" },
      });
    } catch (error) {
      const dbError = DatabaseErrorHandler.handleError(error);
      Logger.error("Database error while checking for existing super admin", {
        error: dbError.message,
        code: dbError.code,
        requestId,
      });

      const errorResponse = ErrorResponseBuilder.database(
        "Failed to check existing super admin",
        dbError.code,
        dbError.isRetryable
      );
      return c.json({ ...errorResponse, requestId }, 500);
    }

    if (existing) {
      /**
       * Log attempt to create duplicate super admin for security monitoring
       */
      SecurityLogger.logSuspiciousActivity(
        "Attempt to create duplicate super admin",
        c,
        {
          existingAdminId: existing.id,
          requestId,
        }
      );

      const errorResponse = ErrorResponseBuilder.validation(
        "Super admin already exists",
        [],
        { existingAdmin: true }
      );
      return c.json({ ...errorResponse, requestId }, 409);
    }

    /**
     * Hash the password securely before storing
     */
    let hashedPassword: string;
    try {
      hashedPassword = await hashPassword(password);
    } catch (error) {
      Logger.error("Password hashing failed during setup", {
        error: error.message,
        requestId,
      });

      const errorResponse = ErrorResponseBuilder.system(
        "Failed to process password. Please try again.",
        "PASSWORD_HASH_FAILED",
        { retryable: true }
      );
      return c.json({ ...errorResponse, requestId }, 500);
    }

    /**
     * Create a new super admin account with hashed password.
     */
    let superAdmin;
    try {
      superAdmin = await db.platformManager.create({
        data: {
          email,
          password: hashedPassword,
          name,
          organization,
          roleType: "SUPER_ADMIN",
          scopes: ["*"],
        },
      });
    } catch (error) {
      const dbError = DatabaseErrorHandler.handleError(error);
      Logger.error("Database error during super admin creation", {
        error: dbError.message,
        code: dbError.code,
        email,
        requestId,
      });

      const errorResponse = ErrorResponseBuilder.database(
        "Failed to create super admin account. Please try again.",
        dbError.code,
        dbError.isRetryable
      );
      return c.json({ ...errorResponse, requestId }, 500);
    }

    /**
     * Update config.json to mark SuperAdminConfigured as true
     */
    const fs = await import("fs/promises");
    const configPath = new URL("../../config.json", import.meta.url).pathname;
    try {
      const configRaw = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configRaw);
      config.SuperAdminConfigured = true;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      Logger.info("Configuration file updated successfully", {
        configPath,
        requestId,
      });
    } catch (err) {
      Logger.error("Failed to update configuration file", {
        error: err.message,
        configPath,
        requestId,
      });
      // Don't fail the request if config update fails, but log the error
      // The super admin was created successfully, so we can continue
    }

    /**
     * Generate authentication tokens for immediate login
     */
    let accessToken: string;
    let refreshToken: string;
    try {
      const tokenPayload = {
        userId: superAdmin.id,
        email: superAdmin.email,
        roleType: superAdmin.roleType,
        scopes: superAdmin.scopes,
      };

      accessToken = await generateAccessToken(tokenPayload);
      refreshToken = await generateRefreshToken(tokenPayload);

      Logger.info("Authentication tokens generated successfully", {
        userId: superAdmin.id,
        requestId,
      });
    } catch (error) {
      Logger.error("Token generation failed during setup", {
        error: error.message,
        userId: superAdmin.id,
        requestId,
      });

      const errorResponse = ErrorResponseBuilder.authentication(
        "Failed to generate authentication tokens. Please try again.",
        "TOKEN_GENERATION_FAILED"
      );
      return c.json({ ...errorResponse, requestId }, 500);
    }

    /**
     * Log successful setup for security monitoring
     */
    SecurityLogger.logSetupAttempt(c, true, {
      email,
      userId: superAdmin.id,
      requestId,
    });

    SecurityLogger.logAuthenticationEvent(
      "Super admin setup completed",
      c,
      superAdmin.id,
      {
        email,
        requestId,
      }
    );

    /**
     * Return authentication response with tokens and user data (excluding password).
     * Add security headers to the response.
     */
    const { password: _, ...safeAdminData } = superAdmin;

    const authResponse: AuthResponse = {
      accessToken,
      refreshToken,
      user: {
        id: safeAdminData.id,
        email: safeAdminData.email,
        name: safeAdminData.name,
        roleType: safeAdminData.roleType,
        scopes: safeAdminData.scopes,
      },
    };

    try {
      const isProd = process.env.NODE_ENV === "production";
      const accessTtl = parseTimeToSeconds(
        process.env.JWT_ACCESS_EXPIRES_IN || "15m"
      );
      const refreshTtl = parseTimeToSeconds(
        process.env.JWT_REFRESH_EXPIRES_IN || "7d"
      );

      setCookie(c, "access_token", accessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "Strict",
        path: "/",
        maxAge: accessTtl,
      });

      setCookie(c, "refresh_token", refreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "Strict",
        path: "/",
        maxAge: refreshTtl,
      });
    } catch (cookieErr) {
      Logger.warn("Failed setting auth cookies; continuing with body tokens", {
        error: (cookieErr as Error).message,
        requestId,
      });
    }

    const response = c.json({
      success: true,
      message: "Super admin setup complete",
      ...authResponse,
      requestId,
    });

    // Add security headers
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    Logger.info("Setup request completed successfully", {
      requestId,
      userId: superAdmin.id,
      email,
    });

    return response;
  } catch (error) {
    Logger.error("Unexpected error during setup", {
      error: error.message,
      stack: error.stack,
      requestId,
    });

    const errorResponse = ErrorResponseBuilder.system(
      "An unexpected error occurred. Please try again.",
      "UNEXPECTED_ERROR",
      { retryable: true }
    );

    return c.json({ ...errorResponse, requestId }, 500);
  }
}
