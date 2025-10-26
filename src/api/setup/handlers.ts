/**
 * Handles the setup of a super admin account.
 * Validates the request payload, checks for existing super admin,
 * and creates a new super admin if none exists.
 * @param {Context} c - Hono context object
 * @returns {Promise<Response>} JSON response indicating result
 */

import type { Context } from "hono";
import { superAdminSetupSchema, type SuperAdminSetupData } from "./validations";
import { db } from "@z0/utils/db/client";
import { hashPassword, generateAccessToken, generateRefreshToken, type AuthResponse } from "@z0/utils/auth";
import { validatePassword } from "@z0/utils/password-validation";
import { 
  Logger, 
  DatabaseErrorHandler, 
  ErrorResponseBuilder, 
  SecurityLogger, 
  RequestContext,
  type FieldError 
} from "@z0/utils/error-handling";

export default async function handleSetup(c: Context) {
  const requestId = RequestContext.generateRequestId();
  const clientInfo = RequestContext.getClientInfo(c);
  
  Logger.info('Setup request initiated', { requestId, ...clientInfo });

  try {
    /**
     * Security checks before processing request
     */
    
    // Check Content-Type header
    const contentType = c.req.header('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      SecurityLogger.logSuspiciousActivity('Invalid content type in setup request', c, {
        contentType,
        requestId
      });
      
      const errorResponse = ErrorResponseBuilder.security(
        'Invalid content type. Expected application/json.',
        'INVALID_CONTENT_TYPE'
      );
      return c.json({ ...errorResponse, requestId }, 400);
    }

    // Check request method (should be POST)
    if (c.req.method !== 'POST') {
      SecurityLogger.logSuspiciousActivity('Invalid HTTP method for setup', c, {
        method: c.req.method,
        requestId
      });
      
      const errorResponse = ErrorResponseBuilder.security(
        'Method not allowed',
        'METHOD_NOT_ALLOWED'
      );
      return c.json({ ...errorResponse, requestId }, 405);
    }

    // Basic CSRF protection: Check for custom header that indicates request from our app
    // This is a simple protection since we're not implementing full CSRF tokens yet
    const origin = c.req.header('origin');
    const referer = c.req.header('referer');
    
    // Allow requests from same origin or localhost during development
    const allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
    const isValidOrigin = origin && (allowedOrigins.includes(origin) || origin.includes('localhost'));
    const isValidReferer = referer && (allowedOrigins.some(allowed => referer.includes(allowed)) || referer.includes('localhost'));
    
    if (!isValidOrigin && !isValidReferer) {
      SecurityLogger.logSuspiciousActivity('Invalid request origin for setup', c, {
        origin,
        referer,
        requestId
      });
      
      const errorResponse = ErrorResponseBuilder.security(
        'Invalid request origin',
        'INVALID_ORIGIN'
      );
      return c.json({ ...errorResponse, requestId }, 403);
    }

    /**
     * Parse and validate request body with size limits
     */
    let body: any;
    try {
      const rawBody = await c.req.text();
      
      // Check request body size (limit to 1KB for setup requests)
      if (rawBody.length > 1024) {
        SecurityLogger.logSuspiciousActivity('Request body too large in setup', c, {
          bodySize: rawBody.length,
          requestId
        });
        
        const errorResponse = ErrorResponseBuilder.security(
          'Request body too large',
          'REQUEST_TOO_LARGE',
          { maxSize: 1024, actualSize: rawBody.length }
        );
        return c.json({ ...errorResponse, requestId }, 413);
      }
      
      body = JSON.parse(rawBody);
    } catch (error) {
      SecurityLogger.logSuspiciousActivity('Invalid JSON payload in setup request', c, {
        error: error.message,
        requestId
      });
      
      const errorResponse = ErrorResponseBuilder.validation(
        'Invalid JSON payload',
        [],
        { parseError: error.message }
      );
      return c.json({ ...errorResponse, requestId }, 400);
    }

    // Additional security: Check for suspicious payload structure
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      SecurityLogger.logSuspiciousActivity('Invalid payload structure in setup request', c, {
        bodyType: typeof body,
        isArray: Array.isArray(body),
        requestId
      });
      
      const errorResponse = ErrorResponseBuilder.security(
        'Invalid payload structure',
        'INVALID_PAYLOAD_STRUCTURE'
      );
      return c.json({ ...errorResponse, requestId }, 400);
    }

    // Check for excessive number of properties (potential DoS)
    if (Object.keys(body).length > 10) {
      SecurityLogger.logSuspiciousActivity('Too many properties in setup request', c, {
        propertyCount: Object.keys(body).length,
        requestId
      });
      
      const errorResponse = ErrorResponseBuilder.security(
        'Too many properties in request',
        'TOO_MANY_PROPERTIES',
        { maxProperties: 10, actualProperties: Object.keys(body).length }
      );
      return c.json({ ...errorResponse, requestId }, 400);
    }

    const result = superAdminSetupSchema.safeParse(body);
    if (!result.success) {
      /**
       * Log validation failures for security monitoring
       */
      SecurityLogger.logSetupAttempt(c, false, {
        validationErrors: result.error.issues.map(issue => ({ 
          path: issue.path, 
          message: issue.message 
        })),
        requestId
      });
      
      // Convert Zod errors to structured field errors
      const fieldErrors: FieldError[] = result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code
      }));
      
      const errorResponse = ErrorResponseBuilder.validation(
        'Validation failed',
        fieldErrors,
        { zodErrors: result.error.issues }
      );
      
      return c.json({ ...errorResponse, requestId }, 400);
    }
    const { email, password, name, organization } = result.data;

    /**
     * Additional server-side password validation for security
     */
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      SecurityLogger.logSetupAttempt(c, false, {
        reason: 'Password validation failed',
        passwordFeedback: passwordValidation.feedback,
        requestId
      });
      
      const fieldErrors: FieldError[] = [{
        field: 'password',
        message: 'Password does not meet security requirements',
        code: 'PASSWORD_WEAK'
      }];
      
      const errorResponse = ErrorResponseBuilder.validation(
        'Password does not meet security requirements',
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
      Logger.error('Database error while checking for existing super admin', {
        error: dbError.message,
        code: dbError.code,
        requestId
      });
      
      const errorResponse = ErrorResponseBuilder.database(
        'Failed to check existing super admin',
        dbError.code,
        dbError.isRetryable
      );
      return c.json({ ...errorResponse, requestId }, 500);
    }

    if (existing) {
      /**
       * Log attempt to create duplicate super admin for security monitoring
       */
      SecurityLogger.logSuspiciousActivity('Attempt to create duplicate super admin', c, {
        existingAdminId: existing.id,
        requestId
      });
      
      const errorResponse = ErrorResponseBuilder.validation(
        'Super admin already exists',
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
      Logger.error('Password hashing failed during setup', {
        error: error.message,
        requestId
      });
      
      const errorResponse = ErrorResponseBuilder.system(
        'Failed to process password. Please try again.',
        'PASSWORD_HASH_FAILED',
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
      Logger.error('Database error during super admin creation', {
        error: dbError.message,
        code: dbError.code,
        email,
        requestId
      });
      
      const errorResponse = ErrorResponseBuilder.database(
        'Failed to create super admin account. Please try again.',
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
      
      Logger.info('Configuration file updated successfully', {
        configPath,
        requestId
      });
    } catch (err) {
      Logger.error('Failed to update configuration file', {
        error: err.message,
        configPath,
        requestId
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
      
      Logger.info('Authentication tokens generated successfully', {
        userId: superAdmin.id,
        requestId
      });
    } catch (error) {
      Logger.error('Token generation failed during setup', {
        error: error.message,
        userId: superAdmin.id,
        requestId
      });
      
      const errorResponse = ErrorResponseBuilder.authentication(
        'Failed to generate authentication tokens. Please try again.',
        'TOKEN_GENERATION_FAILED'
      );
      return c.json({ ...errorResponse, requestId }, 500);
    }

    /**
     * Log successful setup for security monitoring
     */
    SecurityLogger.logSetupAttempt(c, true, {
      email,
      userId: superAdmin.id,
      requestId
    });
    
    SecurityLogger.logAuthenticationEvent('Super admin setup completed', c, superAdmin.id, {
      email,
      requestId
    });

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
      }
    };
    
    const response = c.json({ 
      message: "Super admin setup complete", 
      ...authResponse,
      requestId
    });

    // Add security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    Logger.info('Setup request completed successfully', {
      requestId,
      userId: superAdmin.id,
      email
    });
    
    return response;

  } catch (error) {
    Logger.error('Unexpected error during setup', {
      error: error.message,
      stack: error.stack,
      requestId
    });
    
    const errorResponse = ErrorResponseBuilder.system(
      'An unexpected error occurred. Please try again.',
      'UNEXPECTED_ERROR',
      { retryable: true }
    );
    
    return c.json({ ...errorResponse, requestId }, 500);
  }
}
