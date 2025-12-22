import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../utils/prisma";
import { authMiddleware } from "../../middleware/auth";
import {
  generateSecret,
  generateQRCodeData,
  verifyTOTP,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
} from "../../utils/totp";
import { AuditLogger } from "../../utils/audit-logger";

const twoFactor = new Hono();

// Validation schemas
const verifySetupSchema = z.object({
  token: z.string().length(6).regex(/^\d+$/),
});

const verifyLoginSchema = z.object({
  token: z.string().min(6).max(10), // Can be TOTP (6 digits) or backup code (9 chars with dash)
});

const disableSchema = z.object({
  password: z.string().min(1),
});

// Setup 2FA - Generate secret and QR code
twoFactor.post("/2fa/setup", authMiddleware, async (c) => {
  try {
    const user = c.get("user");

    if (!user || !user.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Check if 2FA is already enabled
    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { twoFactorEnabled: true },
    });

    if (existingUser?.twoFactorEnabled) {
      return c.json({ error: "2FA is already enabled" }, 400);
    }

    // Generate secret
    const secret = generateSecret();

    // Generate QR code data
    const qrCodeData = generateQRCodeData(secret, user.email, "Z0-Auth");

    // Store secret temporarily (not enabled yet)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorSecret: secret,
        twoFactorEnabled: false, // Not enabled until verified
      },
    });

    return c.json({
      secret,
      qrCodeData,
      message:
        "Scan the QR code with your authenticator app and verify with a code",
    });
  } catch (error: any) {
    console.error("Error setting up 2FA:", error);
    return c.json({ error: "Failed to setup 2FA" }, 500);
  }
});

// Verify setup and enable 2FA
twoFactor.post("/2fa/verify-setup", authMiddleware, async (c) => {
  try {
    const user = c.get("user");

    if (!user || !user.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const data = verifySetupSchema.parse(body);

    // Get user's secret
    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!existingUser?.twoFactorSecret) {
      return c.json({ error: "2FA setup not initiated" }, 400);
    }

    if (existingUser.twoFactorEnabled) {
      return c.json({ error: "2FA is already enabled" }, 400);
    }

    // Verify TOTP
    const isValid = await verifyTOTP(existingUser.twoFactorSecret, data.token);

    if (!isValid) {
      return c.json({ error: "Invalid verification code" }, 400);
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes(10);
    const hashedCodes = await Promise.all(
      backupCodes.map((code) => hashBackupCode(code))
    );

    // Fetch user email for audit log
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, organizationId: true }
    });

    // Enable 2FA and save backup codes
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: hashedCodes,
      },
    });

    // Log audit trail
    await AuditLogger.logAuth(
      "TWO_FACTOR_ENABLED",
      c,
      user.id,
      userData?.email,
      {
        actorType: "user",
        severity: "HIGH",
        organizationId: userData?.organizationId,
        metadata: {
          backupCodesGenerated: backupCodes.length
        }
      }
    );

    return c.json({
      message: "2FA enabled successfully",
      backupCodes,
      warning: "Save these backup codes in a secure location. They won't be shown again.",
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation failed", details: error.errors }, 400);
    }
    console.error("Error verifying 2FA setup:", error);
    return c.json({ error: "Failed to verify 2FA setup" }, 500);
  }
});

// Verify 2FA during login (called after password verification)
twoFactor.post("/2fa/verify", async (c) => {
  try {
    const body = await c.req.json();
    const data = verifyLoginSchema.parse(body);

    // This endpoint expects userId to be passed in the request
    // In a real implementation, this would be stored in a temporary session
    const { userId } = body;

    if (!userId) {
      return c.json({ error: "User ID required" }, 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorBackupCodes: true,
      },
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return c.json({ error: "2FA not enabled for this user" }, 400);
    }

    // Check if it's a 6-digit TOTP code
    if (/^\d{6}$/.test(data.token)) {
      const isValid = await verifyTOTP(user.twoFactorSecret, data.token);

      if (isValid) {
        return c.json({ verified: true, message: "2FA verification successful" });
      }
    }

    // Check if it's a backup code (format: XXXX-XXXX)
    if (/^[A-Z2-7]{4}-[A-Z2-7]{4}$/i.test(data.token)) {
      const normalizedCode = data.token.toUpperCase();
      const backupCodes = (user.twoFactorBackupCodes as string[]) || [];

      // Check against each backup code
      for (let i = 0; i < backupCodes.length; i++) {
        const isMatch = await verifyBackupCode(normalizedCode, backupCodes[i]);

        if (isMatch) {
          // Remove used backup code
          const updatedCodes = backupCodes.filter((_, idx) => idx !== i);

          await prisma.user.update({
            where: { id: user.id },
            data: {
              twoFactorBackupCodes: updatedCodes,
            },
          });

          return c.json({
            verified: true,
            message: "Backup code verified",
            warning: `You have ${updatedCodes.length} backup codes remaining`,
          });
        }
      }
    }

    return c.json({ error: "Invalid verification code" }, 400);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation failed", details: error.errors }, 400);
    }
    console.error("Error verifying 2FA:", error);
    return c.json({ error: "Failed to verify 2FA" }, 500);
  }
});

// Disable 2FA
twoFactor.post("/2fa/disable", authMiddleware, async (c) => {
  try {
    const user = c.get("user");

    if (!user || !user.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const data = disableSchema.parse(body);

    // Get user with password
    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        password: true,
        twoFactorEnabled: true,
      },
    });

    if (!existingUser?.twoFactorEnabled) {
      return c.json({ error: "2FA is not enabled" }, 400);
    }

    // Verify password
    const passwordMatch = await Bun.password.verify(
      data.password,
      existingUser.password
    );

    if (!passwordMatch) {
      return c.json({ error: "Invalid password" }, 401);
    }

    // Fetch user email and org for audit log
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, organizationId: true }
    });

    // Disable 2FA
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      },
    });

    // Log audit trail
    await AuditLogger.logAuth(
      "TWO_FACTOR_DISABLED",
      c,
      user.id,
      userData?.email,
      {
        actorType: "user",
        severity: "HIGH",
        organizationId: userData?.organizationId,
        metadata: {
          disabledBy: "user",
          passwordVerified: true
        }
      }
    );

    return c.json({ message: "2FA disabled successfully" });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation failed", details: error.errors }, 400);
    }
    console.error("Error disabling 2FA:", error);
    return c.json({ error: "Failed to disable 2FA" }, 500);
  }
});

// Generate new backup codes
twoFactor.post("/2fa/backup-codes", authMiddleware, async (c) => {
  try {
    const user = c.get("user");

    if (!user || !user.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Check if 2FA is enabled
    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { twoFactorEnabled: true },
    });

    if (!existingUser?.twoFactorEnabled) {
      return c.json({ error: "2FA is not enabled" }, 400);
    }

    // Generate new backup codes
    const backupCodes = generateBackupCodes(10);
    const hashedCodes = await Promise.all(
      backupCodes.map((code) => hashBackupCode(code))
    );

    // Replace old backup codes
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorBackupCodes: hashedCodes,
      },
    });

    return c.json({
      backupCodes,
      message: "New backup codes generated",
      warning: "Save these backup codes in a secure location. Old codes are now invalid.",
    });
  } catch (error: any) {
    console.error("Error generating backup codes:", error);
    return c.json({ error: "Failed to generate backup codes" }, 500);
  }
});

export default twoFactor;
