/**
 * App Portal Authentication
 *
 * Handles authentication for app-level users.
 * These users only have AppMembership context, no org/platform access.
 */

import { db } from "@z0/utils/db/client";
import { Logger } from "@z0/utils/error-handling";

/**
 * Hash a password using Bun's built-in password hashing
 */
export async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

/**
 * Generate a secure random token
 */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validate app user credentials
 */
export async function validateAppUserCredentials(
  appId: string,
  email: string,
  password: string
): Promise<{
  success: boolean;
  user?: { id: string; email: string; name: string };
  error?: string;
}> {
  try {
    // Find user by email
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        status: true,
      },
    });

    if (!user) {
      return { success: false, error: "Invalid email or password." };
    }

    if (user.status !== "ACTIVE") {
      return { success: false, error: "Account is not active." };
    }

    if (!user.password) {
      return {
        success: false,
        error: "Password login not available for this account.",
      };
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return { success: false, error: "Invalid email or password." };
    }

    // Check app membership
    const membership = await db.appMembership.findUnique({
      where: {
        userId_appId: { userId: user.id, appId },
      },
      select: { isActive: true },
    });

    if (!membership || !membership.isActive) {
      return {
        success: false,
        error: "You do not have access to this application.",
      };
    }

    // Update last login
    await db.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        loginCount: { increment: 1 },
      },
    });

    return {
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
    };
  } catch (error) {
    Logger.error("Failed to validate app user credentials", {
      appId,
      email,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { success: false, error: "An error occurred during login." };
  }
}

/**
 * Create a session for an app user
 */
export async function createAppUserSession(
  userId: string,
  appId: string,
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
  }
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.session.create({
    data: {
      userId,
      appId,
      token,
      status: "ACTIVE",
      expiresAt,
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
    },
  });

  return { token, expiresAt };
}

/**
 * Get app user from session token
 */
export async function getAppUserFromSession(
  token: string,
  appId: string
): Promise<{
  id: string;
  email: string;
  name: string;
  avatar?: string;
} | null> {
  try {
    const session = await db.session.findFirst({
      where: {
        token,
        appId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            status: true,
          },
        },
      },
    });

    if (!session || session.user.status !== "ACTIVE") {
      return null;
    }

    // Update last used
    await db.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      avatar: session.user.avatar || undefined,
    };
  } catch (error) {
    Logger.error("Failed to get app user from session", {
      appId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

/**
 * Build token payload for app users
 * This creates a JWT with ONLY app context, no org/platform access
 */
export function buildAppUserTokenPayload(
  user: { id: string; email: string; name: string },
  app: { id: string; slug: string }
): {
  userId: string;
  email: string;
  name: string;
  appContext: {
    appId: string;
    appSlug: string;
    roleType: "APP_USER";
  };
  effectiveScopes: string[];
} {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    appContext: {
      appId: app.id,
      appSlug: app.slug,
      roleType: "APP_USER",
    },
    effectiveScopes: ["app:profile:read", "app:profile:write"],
  };
}
