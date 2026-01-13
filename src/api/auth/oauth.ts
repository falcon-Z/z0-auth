/**
 * OAuth Authentication Routes
 * Handles OAuth 2.0 authorization flow
 */

import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { OAuthService } from "../../utils/oauth/oauth-service";
import { OAuthProviderFactory } from "../../utils/oauth/provider-factory";
import { OAuthProvider } from "../../utils/oauth/types";
import { ErrorResponseBuilder, Logger } from "../../utils/error-handling";
import { db } from "@z0/utils/db/client";
import {
  buildTokenPayload,
  generateAccessToken,
  generateRefreshToken,
  type UserWithMemberships,
} from "@z0/utils/auth";
import { z } from "zod";

const oauth = new Hono();

/**
 * GET /api/auth/oauth/:provider
 * Initiate OAuth authorization flow
 */
oauth.get("/:provider", async (c) => {
  try {
    const provider = c.req.param("provider").toUpperCase() as OAuthProvider;
    const organizationId = c.req.query("organizationId");
    const returnUrl = c.req.query("returnUrl");

    // Validate provider
    if (!OAuthProviderFactory.isProviderSupported(provider)) {
      return c.json(
        ErrorResponseBuilder.validation(
          `OAuth provider ${provider} not supported`,
          [
            {
              field: "provider",
              message: `Supported providers: ${OAuthProviderFactory.getSupportedProviders().join(", ")}`,
            },
          ]
        ),
        400
      );
    }

    // Validate organization ID
    if (!organizationId) {
      return c.json(
        ErrorResponseBuilder.validation("Organization ID is required", [
          {
            field: "organizationId",
            message: "Organization ID query parameter is required",
          },
        ]),
        400
      );
    }

    // Initiate OAuth flow
    const result = await OAuthService.initiateAuthorization(
      provider,
      organizationId,
      returnUrl
    );

    // Redirect to OAuth provider
    return c.redirect(result.authorizationUrl);
  } catch (error: any) {
    return c.json(
      ErrorResponseBuilder.system(
        "Failed to initiate OAuth authorization",
        "OAUTH_INIT_FAILED",
        { error: error.message }
      ),
      500
    );
  }
});

/**
 * GET /api/auth/oauth/:provider/callback
 * Handle OAuth callback
 */
oauth.get("/:provider/callback", async (c) => {
  try {
    const provider = c.req.param("provider").toUpperCase();
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");
    const errorDescription = c.req.query("error_description");

    // Check for OAuth error
    if (error) {
      return c.json(
        ErrorResponseBuilder.authorization(
          errorDescription || `OAuth error: ${error}`,
          "OAUTH_ERROR"
        ),
        400
      );
    }

    // Validate required parameters
    if (!code || !state) {
      return c.json(
        ErrorResponseBuilder.validation("Missing OAuth callback parameters", [
          {
            field: "code",
            message: "Authorization code is required",
          },
          {
            field: "state",
            message: "State parameter is required",
          },
        ]),
        400
      );
    }

    // Get IP and user agent
    const ipAddress =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
      c.req.header("x-real-ip") ||
      c.req.header("cf-connecting-ip");

    const userAgent = c.req.header("user-agent");

    // Handle OAuth callback
    const result = await OAuthService.handleCallback(
      code,
      state,
      ipAddress,
      userAgent
    );

    // Fetch user with all memberships for token building
    const userWithMemberships = await db.user.findUnique({
      where: { id: result.user.id },
      include: {
        platformMembership: true,
        organizationMemberships: {
          where: { isActive: true },
          include: { organization: true },
        },
        appMemberships: {
          where: { isActive: true },
        },
      },
    });

    if (!userWithMemberships) {
      return c.json(
        ErrorResponseBuilder.authentication(
          "User not found after OAuth",
          "USER_NOT_FOUND"
        ),
        401
      );
    }

    // Build token payload using memberships
    const tokenPayload = buildTokenPayload(userWithMemberships as UserWithMemberships);

    // Generate JWT tokens
    const accessToken = await generateAccessToken(tokenPayload);
    const refreshToken = await generateRefreshToken(tokenPayload);

    // Set cookies
    const isProd = process.env.NODE_ENV === "production";
    setCookie(c, "access_token", accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "Lax",
      path: "/",
      maxAge: 900, // 15 minutes
    });
    setCookie(c, "refresh_token", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "Lax",
      path: "/",
      maxAge: 604800, // 7 days
    });

    // Update user login info
    await db.user.update({
      where: { id: result.user.id },
      data: {
        lastLoginAt: new Date(),
        loginCount: { increment: 1 },
      },
    }).catch((error) => {
      Logger.error("Failed to update login info after OAuth", {
        userId: result.user.id,
        error: error.message,
      });
    });

    // Redirect based on state or default to dashboard
    const stateData = c.get("oauthState");
    const redirectUrl = stateData?.returnUrl || "/dashboard";

    return c.redirect(redirectUrl);
  } catch (error: any) {
    return c.json(
      ErrorResponseBuilder.system(
        "OAuth callback failed",
        "OAUTH_CALLBACK_FAILED",
        { error: error.message }
      ),
      500
    );
  }
});

export default oauth;
