import { Hono } from "hono";
import { prisma } from "../../../utils/prisma";
import { authMiddleware } from "../../../middleware/auth";
import { parseDeviceInfo, getLocationFromIP } from "../../../utils/device-fingerprint";

const devices = new Hono();

// List user's devices
devices.get("/devices", authMiddleware, async (c) => {
  try {
    const user = c.get("user");

    if (!user || !user.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userDevices = await prisma.device.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        lastUsedAt: "desc",
      },
      include: {
        _count: {
          select: {
            deviceEvents: true,
          },
        },
      },
    });

    // Parse device info and check if current device
    const currentFingerprint = c.req.header("x-fingerprint");

    return c.json({
      devices: userDevices.map((device) => {
        const deviceInfo = parseDeviceInfo(device.userAgent);
        const location = getLocationFromIP(device.ipAddress || "unknown");

        return {
          id: device.id,
          deviceInfo,
          userAgent: device.userAgent,
          ipAddress: device.ipAddress,
          location,
          fingerprint: device.fingerprint,
          isTrusted: device.isTrusted,
          isBlocked: device.isBlocked,
          createdAt: device.createdAt,
          lastUsedAt: device.lastUsedAt,
          isCurrent: device.fingerprint === currentFingerprint,
          eventCount: device._count.deviceEvents,
        };
      }),
    });
  } catch (error: any) {
    console.error("Error fetching devices:", error);
    return c.json({ error: "Failed to fetch devices" }, 500);
  }
});

// Mark device as trusted
devices.patch("/devices/:deviceId/trust", authMiddleware, async (c) => {
  try {
    const user = c.get("user");

    if (!user || !user.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const deviceId = c.req.param("deviceId");

    // Verify device belongs to user
    const device = await prisma.device.findFirst({
      where: {
        id: deviceId,
        userId: user.id,
      },
    });

    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    // Update device
    const updatedDevice = await prisma.device.update({
      where: { id: deviceId },
      data: {
        isTrusted: true,
      },
    });

    // Log event
    await prisma.deviceEvent.create({
      data: {
        deviceId,
        eventType: "TRUSTED",
        ipAddress: device.ipAddress,
        userAgent: device.userAgent,
      },
    });

    return c.json({
      device: updatedDevice,
      message: "Device marked as trusted",
    });
  } catch (error: any) {
    console.error("Error trusting device:", error);
    return c.json({ error: "Failed to trust device" }, 500);
  }
});

// Block device
devices.patch("/devices/:deviceId/block", authMiddleware, async (c) => {
  try {
    const user = c.get("user");

    if (!user || !user.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const deviceId = c.req.param("deviceId");

    // Verify device belongs to user
    const device = await prisma.device.findFirst({
      where: {
        id: deviceId,
        userId: user.id,
      },
    });

    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    // Update device
    const updatedDevice = await prisma.device.update({
      where: { id: deviceId },
      data: {
        isBlocked: true,
        isTrusted: false,
      },
    });

    // Log event
    await prisma.deviceEvent.create({
      data: {
        deviceId,
        eventType: "BLOCKED",
        ipAddress: device.ipAddress,
        userAgent: device.userAgent,
      },
    });

    // Revoke all sessions from this device
    await prisma.session.updateMany({
      where: {
        userId: user.id,
        deviceId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    return c.json({
      device: updatedDevice,
      message: "Device blocked and all sessions revoked",
    });
  } catch (error: any) {
    console.error("Error blocking device:", error);
    return c.json({ error: "Failed to block device" }, 500);
  }
});

// Remove device
devices.delete("/devices/:deviceId", authMiddleware, async (c) => {
  try {
    const user = c.get("user");

    if (!user || !user.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const deviceId = c.req.param("deviceId");

    // Verify device belongs to user
    const device = await prisma.device.findFirst({
      where: {
        id: deviceId,
        userId: user.id,
      },
    });

    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    // Revoke all sessions from this device first
    await prisma.session.updateMany({
      where: {
        userId: user.id,
        deviceId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    // Delete device (cascade will handle device events)
    await prisma.device.delete({
      where: { id: deviceId },
    });

    return c.json({ message: "Device removed successfully" });
  } catch (error: any) {
    console.error("Error removing device:", error);
    return c.json({ error: "Failed to remove device" }, 500);
  }
});

// Get device events/history
devices.get("/devices/:deviceId/events", authMiddleware, async (c) => {
  try {
    const user = c.get("user");

    if (!user || !user.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const deviceId = c.req.param("deviceId");

    // Verify device belongs to user
    const device = await prisma.device.findFirst({
      where: {
        id: deviceId,
        userId: user.id,
      },
    });

    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    const events = await prisma.deviceEvent.findMany({
      where: { deviceId },
      orderBy: {
        createdAt: "desc",
      },
      take: 50, // Limit to last 50 events
    });

    return c.json({ events });
  } catch (error: any) {
    console.error("Error fetching device events:", error);
    return c.json({ error: "Failed to fetch device events" }, 500);
  }
});

export default devices;
