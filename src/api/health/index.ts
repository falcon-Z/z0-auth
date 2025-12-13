import { Hono } from "hono";
import { db } from "@z0/utils/db/client";
import { Logger } from "@z0/utils/error-handling";

const health = new Hono();

/**
 * GET /api/health/live
 * Basic Liveness Probe - K8s/LoadBalancer use this to check if process is up
 */
health.get("/live", (c) => {
  return c.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * GET /api/health/ready
 * Readiness Probe - Checks if critical dependencies (DB) are reachable
 */
health.get("/ready", async (c) => {
  try {
    // Lightweight query to check DB connection
    await db.$queryRaw`SELECT 1`;
    return c.json({ status: "ready" });
  } catch (error) {
    Logger.error("Health check failed: Database unreachable", { error: (error as Error).message });
    return c.json({ 
      status: "not_ready", 
      error: "Database unreachable" 
    }, 503);
  }
});

/**
 * GET /api/health/metrics
 * Basic application metrics
 */
health.get("/metrics", (c) => {
  const memoryUsage = process.memoryUsage();
  return c.json({
    uptime: process.uptime(),
    memory: {
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + "MB",
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + "MB",
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + "MB",
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version
    },
    timestamp: new Date().toISOString()
  });
});

export default health;
