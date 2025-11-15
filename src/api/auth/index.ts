import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { db } from "@z0/utils/db/client";
import {
  verifyRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  parseTimeToSeconds,
} from "@z0/utils/auth";
import {
  Logger,
  DatabaseErrorHandler,
  ErrorResponseBuilder,
  SecurityLogger,
  RequestContext,
} from "@z0/utils/error-handling";

const AuthRoutes = new Hono();

AuthRoutes.post("/refresh", async (c) => {
  const requestId = RequestContext.generateRequestId();
  const clientInfo = RequestContext.getClientInfo(c);

  Logger.info("Token refresh requested", { requestId, ...clientInfo });

  try {
    const refreshCookie = getCookie(c, "refresh_token");
    if (!refreshCookie) {
      const err = ErrorResponseBuilder.authentication(
        "Missing refresh token cookie",
        "REFRESH_TOKEN_MISSING"
      );
      return c.json({ ...err, requestId }, 401);
    }

    let payload;
    try {
      payload = await verifyRefreshToken(refreshCookie);
    } catch (error) {
      SecurityLogger.logAuthenticationEvent(
        "Invalid refresh token",
        c,
        undefined,
        { requestId }
      );
      const err = ErrorResponseBuilder.authentication(
        "Invalid or expired refresh token",
        "REFRESH_TOKEN_INVALID"
      );
      return c.json({ ...err, requestId }, 401);
    }

    try {
      const user = await db.platformManager.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          email: true,
          name: true,
          roleType: true,
          scopes: true,
        },
      });

      if (!user) {
        const err = ErrorResponseBuilder.authentication(
          "User no longer exists",
          "USER_NOT_FOUND"
        );
        return c.json({ ...err, requestId }, 401);
      }

      const tokenPayload = {
        userId: user.id,
        email: user.email,
        roleType: user.roleType,
        scopes: user.scopes,
      };

      const newAccessToken = await generateAccessToken(tokenPayload);
      const newRefreshToken = await generateRefreshToken(tokenPayload);

      const isProd = process.env.NODE_ENV === "production";
      const accessTtl = parseTimeToSeconds(
        process.env.JWT_ACCESS_EXPIRES_IN || "15m"
      );
      const refreshTtl = parseTimeToSeconds(
        process.env.JWT_REFRESH_EXPIRES_IN || "7d"
      );

      setCookie(c, "access_token", newAccessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "Strict",
        path: "/",
        maxAge: accessTtl,
      });

      setCookie(c, "refresh_token", newRefreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "Strict",
        path: "/",
        maxAge: refreshTtl,
      });

      SecurityLogger.logAuthenticationEvent("Tokens refreshed", c, user.id, {
        requestId,
      });

      const res = c.json({
        success: true,
        message: "Token refreshed",
        accessToken: newAccessToken,
        user,
        requestId,
      });

      res.headers.set("X-Content-Type-Options", "nosniff");
      res.headers.set("X-Frame-Options", "DENY");
      res.headers.set("X-XSS-Protection", "1; mode=block");
      res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

      return res;
    } catch (error) {
      const dbError = DatabaseErrorHandler.handleError(error);
      Logger.error("Database error during token refresh", {
        error: dbError.message,
        code: dbError.code,
        requestId,
      });
      const err = ErrorResponseBuilder.database(
        "Failed to refresh token",
        dbError.code,
        dbError.isRetryable
      );
      return c.json({ ...err, requestId }, 500);
    }
  } catch (error) {
    Logger.error("Unexpected error during token refresh", {
      error: (error as Error).message,
      requestId,
    });
    const err = ErrorResponseBuilder.system(
      "Unexpected error during token refresh",
      "UNEXPECTED_ERROR",
      { retryable: true }
    );
    return c.json({ ...err, requestId }, 500);
  }
});

export default AuthRoutes;
