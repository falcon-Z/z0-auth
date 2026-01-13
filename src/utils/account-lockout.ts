import { prisma } from "./prisma";

// Lockout policy configuration
export const LOCKOUT_POLICY = {
  maxAttempts: 5, // Maximum failed attempts before lockout
  lockoutDuration: 15 * 60 * 1000, // 15 minutes in milliseconds
  progressiveDelay: true, // Enable progressive delay
  attemptWindowMs: 30 * 60 * 1000, // 30 minutes window for counting attempts
};

/**
 * Calculate progressive delay based on number of attempts
 * Returns delay in milliseconds
 */
export function calculateProgressiveDelay(attempts: number): number {
  if (!LOCKOUT_POLICY.progressiveDelay) {
    return 0;
  }

  // Progressive delay: 1s, 2s, 3s, 4s, up to 10s
  const delay = Math.min(attempts * 1000, 10000);
  return delay;
}

/**
 * Record a failed login attempt
 * Returns lockout status and delay information
 */
export async function recordFailedAttempt(
  email: string
): Promise<{
  isLocked: boolean;
  remainingAttempts: number;
  lockoutUntil?: Date;
  delayMs: number;
}> {
  try {
    const now = new Date();

    // Find or create lockout record
    let lockout = await prisma.accountLockout.findUnique({
      where: { email },
    });

    if (!lockout) {
      // Create new lockout record
      lockout = await prisma.accountLockout.create({
        data: {
          email,
          failedAttempts: 1,
          lastAttempt: now,
        },
      });

      return {
        isLocked: false,
        remainingAttempts: LOCKOUT_POLICY.maxAttempts - 1,
        delayMs: calculateProgressiveDelay(1),
      };
    }

    // Check if currently locked
    if (lockout.lockedUntil && lockout.lockedUntil > now) {
      return {
        isLocked: true,
        remainingAttempts: 0,
        lockoutUntil: lockout.lockedUntil,
        delayMs: 0,
      };
    }

    // If lockout expired, reset counter
    if (lockout.lockedUntil && lockout.lockedUntil <= now) {
      lockout = await prisma.accountLockout.update({
        where: { email },
        data: {
          failedAttempts: 1,
          lastAttempt: now,
          lockedUntil: null,
        },
      });

      return {
        isLocked: false,
        remainingAttempts: LOCKOUT_POLICY.maxAttempts - 1,
        delayMs: calculateProgressiveDelay(1),
      };
    }

    // Check if attempts are within the time window
    const attemptWindowStart = new Date(now.getTime() - LOCKOUT_POLICY.attemptWindowMs);
    if (lockout.lastAttempt && lockout.lastAttempt < attemptWindowStart) {
      // Reset counter if last attempt was outside the window
      lockout = await prisma.accountLockout.update({
        where: { email },
        data: {
          failedAttempts: 1,
          lastAttempt: now,
        },
      });

      return {
        isLocked: false,
        remainingAttempts: LOCKOUT_POLICY.maxAttempts - 1,
        delayMs: calculateProgressiveDelay(1),
      };
    }

    // Increment failed attempts
    const newAttempts = lockout.failedAttempts + 1;

    // Check if we've hit the limit
    if (newAttempts >= LOCKOUT_POLICY.maxAttempts) {
      const lockoutUntil = new Date(now.getTime() + LOCKOUT_POLICY.lockoutDuration);

      await prisma.accountLockout.update({
        where: { email },
        data: {
          failedAttempts: newAttempts,
          lastAttempt: now,
          lockedUntil: lockoutUntil,
        },
      });

      return {
        isLocked: true,
        remainingAttempts: 0,
        lockoutUntil,
        delayMs: 0,
      };
    }

    // Update attempt count
    await prisma.accountLockout.update({
      where: { email },
      data: {
        failedAttempts: newAttempts,
        lastAttempt: now,
      },
    });

    return {
      isLocked: false,
      remainingAttempts: LOCKOUT_POLICY.maxAttempts - newAttempts,
      delayMs: calculateProgressiveDelay(newAttempts),
    };
  } catch (error) {
    console.error("Error recording failed attempt:", error);
    // On error, don't block login but log the issue
    return {
      isLocked: false,
      remainingAttempts: LOCKOUT_POLICY.maxAttempts,
      delayMs: 0,
    };
  }
}

/**
 * Check if an account is currently locked
 * Returns lockout status and remaining time
 */
export async function checkLockoutStatus(
  email: string
): Promise<{
  isLocked: boolean;
  lockoutUntil?: Date;
  remainingMs?: number;
}> {
  try {
    const lockout = await prisma.accountLockout.findUnique({
      where: { email },
    });

    if (!lockout || !lockout.lockedUntil) {
      return { isLocked: false };
    }

    const now = new Date();

    if (lockout.lockedUntil > now) {
      const remainingMs = lockout.lockedUntil.getTime() - now.getTime();
      return {
        isLocked: true,
        lockoutUntil: lockout.lockedUntil,
        remainingMs,
      };
    }

    // Lockout expired
    return { isLocked: false };
  } catch (error) {
    console.error("Error checking lockout status:", error);
    return { isLocked: false };
  }
}

/**
 * Reset lockout for an account (called on successful login or by admin)
 */
export async function resetLockout(email: string): Promise<void> {
  try {
    await prisma.accountLockout.deleteMany({
      where: { email },
    });
  } catch (error) {
    console.error("Error resetting lockout:", error);
  }
}

/**
 * Get lockout statistics for an email
 */
export async function getLockoutStats(
  email: string
): Promise<{
  failedAttempts: number;
  lastAttempt?: Date;
  isLocked: boolean;
  lockoutUntil?: Date;
} | null> {
  try {
    const lockout = await prisma.accountLockout.findUnique({
      where: { email },
    });

    if (!lockout) {
      return null;
    }

    const now = new Date();
    const isLocked = lockout.lockedUntil ? lockout.lockedUntil > now : false;

    return {
      failedAttempts: lockout.failedAttempts,
      lastAttempt: lockout.lastAttempt || undefined,
      isLocked,
      lockoutUntil: isLocked ? lockout.lockedUntil || undefined : undefined,
    };
  } catch (error) {
    console.error("Error getting lockout stats:", error);
    return null;
  }
}

/**
 * Format remaining lockout time as human-readable string
 */
export function formatRemainingTime(remainingMs: number): string {
  const minutes = Math.ceil(remainingMs / 1000 / 60);

  if (minutes < 1) {
    return "less than a minute";
  } else if (minutes === 1) {
    return "1 minute";
  } else {
    return `${minutes} minutes`;
  }
}
