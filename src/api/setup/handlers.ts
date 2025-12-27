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
import {
  type SuperAdminSetupData,
  type ValidateEmailRequest,
  type ValidateOrganizationRequest,
  generateSlug,
} from "./validations";
import { db } from "@z0/utils/db/client";
import { hashPassword } from "@z0/utils/auth";
import { validatePassword } from "@z0/utils/password-validation";
import {
  Logger,
  DatabaseErrorHandler,
  ErrorResponseBuilder,
  SecurityLogger,
  RequestContext,
  type FieldError,
} from "@z0/utils/error-handling";
import { isSetupComplete, getSetupState } from "@z0/utils/setup-state";

/**
 * Get current setup status
 * Public endpoint - returns whether setup is complete
 * This is used by the frontend to determine routing
 */
export async function getSetupStatus(c: Context) {
  const setupComplete = isSetupComplete();
  const state = getSetupState();

  return c.json({
    setupComplete,
    requiresSetup: !setupComplete,
    ...(state && {
      lastChecked: state.lastChecked.toISOString(),
      superAdminCount: state.superAdminCount,
    }),
  });
}

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
    // Check in-memory setup state (faster than DB query)
    const setupComplete = isSetupComplete();

    // Also verify with database for accuracy
    let existingAdmin;
    try {
      existingAdmin = await db.platformMembership.findFirst({
        where: { roleType: "SUPER_ADMIN", isActive: true },
        select: { id: true, userId: true },
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

    const configured = setupComplete || !!existingAdmin;
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

    // Check if user with this email exists
    let existingUser;
    try {
      existingUser = await db.user.findUnique({
        where: { email },
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

    const available = !existingUser;

    if (!available) {
      SecurityLogger.logSuspiciousActivity(
        "Attempt to use existing user email during setup",
        c,
        {
          email,
          existingUserId: existingUser?.id,
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
     * (User with active platform membership as SUPER_ADMIN)
     */
    let existingAdmin;
    try {
      existingAdmin = await db.platformMembership.findFirst({
        where: { roleType: "SUPER_ADMIN", isActive: true },
        include: { user: { select: { id: true, email: true } } },
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

    if (existingAdmin) {
      /**
       * Log attempt to create duplicate super admin for security monitoring
       */
      SecurityLogger.logSuspiciousActivity(
        "Attempt to create duplicate super admin",
        c,
        {
          existingAdminId: existingAdmin.userId,
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
     * Create user, organization, and memberships in a transaction
     */
    let user;
    let defaultOrg;

    try {
      // Generate organization slug
      const defaultOrgSlug = generateSlug(organization);
      let finalSlug = defaultOrgSlug;
      let counter = 1;

      // Check for slug collision
      while (await db.organization.findUnique({ where: { slug: finalSlug } })) {
        finalSlug = `${defaultOrgSlug}-${counter}`;
        counter++;
      }

      // Create everything in a transaction
      const result = await db.$transaction(async (tx) => {
        // 1. Create the Organization first
        const org = await tx.organization.create({
          data: {
            name: organization,
            slug: finalSlug,
            description: "Default organization created during system setup",
            status: "ACTIVE",
          },
        });

        // 2. Create the User
        const newUser = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            name,
            status: "ACTIVE",
            emailVerified: true, // Super admin is auto-verified
          },
        });

        // 3. Create Platform Membership (SUPER_ADMIN)
        await tx.platformMembership.create({
          data: {
            userId: newUser.id,
            roleType: "SUPER_ADMIN",
            scopes: ["*"],
            isActive: true,
          },
        });

        // 4. Create Organization Membership (ORG_OWNER)
        await tx.organizationMembership.create({
          data: {
            userId: newUser.id,
            organizationId: org.id,
            roleType: "ORG_OWNER",
            isActive: true,
            isDefault: true, // This is the user's default org
          },
        });

        return { user: newUser, org };
      });

      user = result.user;
      defaultOrg = result.org;

      Logger.info("Setup completed: User, Organization, and Memberships created", {
        userId: user.id,
        orgId: defaultOrg.id,
        orgSlug: finalSlug,
        requestId,
      });
    } catch (error) {
      const dbError = DatabaseErrorHandler.handleError(error);
      Logger.error("Database error during setup transaction", {
        error: dbError.message,
        code: dbError.code,
        email,
        requestId,
      });

      const errorResponse = ErrorResponseBuilder.database(
        "Failed to complete setup. Please try again.",
        dbError.code,
        dbError.isRetryable
      );
      return c.json({ ...errorResponse, requestId }, 500);
    }

    /**
     * Mark setup as complete in memory
     */
    const { markSetupComplete } = await import("@z0/utils/setup-state");
    markSetupComplete();
    Logger.info("Setup marked as complete", { requestId });

    /**
     * Log successful setup for security monitoring
     */
    SecurityLogger.logSetupAttempt(c, true, {
      email,
      userId: user.id,
      organizationId: defaultOrg.id,
      requestId,
    });

    /**
     * Return setup completion response (no authentication tokens)
     * User must login separately to acquire tokens
     */
    const response = c.json({
      success: true,
      message:
        "Super admin setup complete. Please login with your credentials to acquire access tokens.",
      email,
      userId: user.id,
      organizationId: defaultOrg.id,
      organizationSlug: defaultOrg.slug,
      requestId,
    });

    // Add security headers
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    Logger.info("Setup request completed successfully", {
      requestId,
      userId: user.id,
      organizationId: defaultOrg.id,
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
