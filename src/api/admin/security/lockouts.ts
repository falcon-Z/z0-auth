import { Hono } from "hono";
import { prisma } from "../../../utils/prisma";
import { authMiddleware } from "../../../middleware/auth";
import { resetLockout, formatRemainingTime } from "../../../utils/account-lockout";

const lockouts = new Hono();

// List all locked accounts
lockouts.get("/lockouts", authMiddleware, async (c) => {
  try {
    const { page = "1", limit = "20", search } = c.req.query();
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const now = new Date();

    // Build where clause
    const where: any = {
      lockedUntil: {
        gt: now, // Only show currently locked accounts
      },
    };

    if (search) {
      where.email = {
        contains: search,
        mode: "insensitive",
      };
    }

    // Get locked accounts
    const [lockedAccounts, total] = await Promise.all([
      prisma.accountLockout.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: {
          lockedUntil: "desc",
        },
      }),
      prisma.accountLockout.count({ where }),
    ]);

    return c.json({
      lockouts: lockedAccounts.map((lockout) => {
        const remainingMs = lockout.lockedUntil
          ? lockout.lockedUntil.getTime() - now.getTime()
          : 0;

        return {
          id: lockout.id,
          email: lockout.email,
          failedAttempts: lockout.failedAttempts,
          lastAttempt: lockout.lastAttempt,
          lockedUntil: lockout.lockedUntil,
          remainingTime: remainingMs > 0 ? formatRemainingTime(remainingMs) : null,
          createdAt: lockout.createdAt,
          updatedAt: lockout.updatedAt,
        };
      }),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error("Error fetching locked accounts:", error);
    return c.json({ error: "Failed to fetch locked accounts" }, 500);
  }
});

// Get lockout details for a specific email
lockouts.get("/lockouts/:email", authMiddleware, async (c) => {
  try {
    const email = c.req.param("email");

    const lockout = await prisma.accountLockout.findUnique({
      where: { email },
    });

    if (!lockout) {
      return c.json({ error: "No lockout record found for this email" }, 404);
    }

    const now = new Date();
    const isCurrentlyLocked = lockout.lockedUntil ? lockout.lockedUntil > now : false;
    const remainingMs = lockout.lockedUntil
      ? Math.max(0, lockout.lockedUntil.getTime() - now.getTime())
      : 0;

    return c.json({
      lockout: {
        id: lockout.id,
        email: lockout.email,
        failedAttempts: lockout.failedAttempts,
        lastAttempt: lockout.lastAttempt,
        lockedUntil: lockout.lockedUntil,
        isCurrentlyLocked,
        remainingTime: remainingMs > 0 ? formatRemainingTime(remainingMs) : null,
        createdAt: lockout.createdAt,
        updatedAt: lockout.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Error fetching lockout details:", error);
    return c.json({ error: "Failed to fetch lockout details" }, 500);
  }
});

// Unlock an account
lockouts.delete("/lockouts/:email", authMiddleware, async (c) => {
  try {
    const email = c.req.param("email");

    // Check if lockout exists
    const lockout = await prisma.accountLockout.findUnique({
      where: { email },
    });

    if (!lockout) {
      return c.json({ error: "No lockout record found for this email" }, 404);
    }

    // Reset lockout
    await resetLockout(email);

    return c.json({
      message: "Account unlocked successfully",
      email,
    });
  } catch (error: any) {
    console.error("Error unlocking account:", error);
    return c.json({ error: "Failed to unlock account" }, 500);
  }
});

// Get lockout statistics
lockouts.get("/lockouts-stats", authMiddleware, async (c) => {
  try {
    const now = new Date();

    const [totalLockouts, currentlyLocked, totalAttempts] = await Promise.all([
      prisma.accountLockout.count(),
      prisma.accountLockout.count({
        where: {
          lockedUntil: {
            gt: now,
          },
        },
      }),
      prisma.accountLockout.aggregate({
        _sum: {
          failedAttempts: true,
        },
      }),
    ]);

    // Get recent lockouts (last 24 hours)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentLockouts = await prisma.accountLockout.count({
      where: {
        createdAt: {
          gte: oneDayAgo,
        },
      },
    });

    return c.json({
      stats: {
        totalLockouts,
        currentlyLocked,
        totalFailedAttempts: totalAttempts._sum.failedAttempts || 0,
        recentLockouts24h: recentLockouts,
      },
    });
  } catch (error: any) {
    console.error("Error fetching lockout stats:", error);
    return c.json({ error: "Failed to fetch lockout statistics" }, 500);
  }
});

export default lockouts;
