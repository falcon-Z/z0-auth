/**
 * Audit Log API Endpoints
 * Platform admin only - view audit logs and statistics
 */

import { Hono } from "hono";
import { AuditLogger } from "@z0/utils/audit-logger";
import { ErrorResponseBuilder } from "@z0/utils/error-handling";
import { z } from "zod";
import type { TokenPayload } from "@z0/utils/auth";

const auditLogsRoutes = new Hono();

// Query schema
const querySchema = z.object({
  action: z.string().optional(),
  actorId: z.string().optional(),
  targetId: z.string().optional(),
  organizationId: z.string().optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

/**
 * GET /api/admin/audit-logs
 * Query audit logs with filters
 */
auditLogsRoutes.get("/", async (c) => {
  try {
    const user = c.get("user") as TokenPayload | undefined;

    // Only platform members can view audit logs
    if (!user || !user.platformRole) {
      return c.json(
        ErrorResponseBuilder.authorization(
          "Unauthorized",
          "ADMIN_REQUIRED"
        ),
        403
      );
    }

    const query = c.req.query();
    const parsed = querySchema.safeParse(query);

    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid query parameters",
          parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
            code: i.code,
          }))
        ),
        400
      );
    }

    const filters: any = {
      action: parsed.data.action,
      actorId: parsed.data.actorId,
      targetId: parsed.data.targetId,
      organizationId: parsed.data.organizationId,
      severity: parsed.data.severity,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
      limit: parsed.data.limit ? parseInt(parsed.data.limit) : undefined,
      offset: parsed.data.offset ? parseInt(parsed.data.offset) : undefined,
    };

    const result = await AuditLogger.query(filters);

    // Log the audit log access
    await AuditLogger.logAdminAction("SENSITIVE_DATA_ACCESSED", user.userId, {
      metadata: { resource: "audit_logs", filters },
    });

    return c.json({
      logs: result.logs,
      total: result.total,
      limit: filters.limit || 100,
      offset: filters.offset || 0,
    });
  } catch (error: any) {
    return c.json(
      ErrorResponseBuilder.system(
        "Failed to query audit logs",
        "QUERY_FAILED",
        { error: error.message }
      ),
      500
    );
  }
});

/**
 * GET /api/admin/audit-logs/statistics
 * Get audit log statistics
 */
auditLogsRoutes.get("/statistics", async (c) => {
  try {
    const user = c.get("user") as TokenPayload | undefined;

    // Only platform members can view statistics
    if (!user || !user.platformRole) {
      return c.json(
        ErrorResponseBuilder.authorization(
          "Unauthorized",
          "ADMIN_REQUIRED"
        ),
        403
      );
    }

    const query = c.req.query();
    const options: any = {
      organizationId: query.organizationId,
      actorId: query.actorId,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    };

    const statistics = await AuditLogger.getStatistics(options);

    // Log the statistics access
    await AuditLogger.logAdminAction("SENSITIVE_DATA_ACCESSED", user.userId, {
      metadata: { resource: "audit_log_statistics", options },
    });

    return c.json({ statistics });
  } catch (error: any) {
    return c.json(
      ErrorResponseBuilder.system(
        "Failed to get audit statistics",
        "STATISTICS_FAILED",
        { error: error.message }
      ),
      500
    );
  }
});

/**
 * GET /api/admin/audit-logs/:id
 * Get specific audit log entry
 */
auditLogsRoutes.get("/:id", async (c) => {
  try {
    const user = c.get("user") as TokenPayload | undefined;

    // Only platform members can view audit logs
    if (!user || !user.platformRole) {
      return c.json(
        ErrorResponseBuilder.authorization(
          "Unauthorized",
          "ADMIN_REQUIRED"
        ),
        403
      );
    }

    const id = c.req.param("id");

    const { prisma } = await import("@z0/utils/prisma");

    if (!prisma.auditLog) {
      return c.json(
        ErrorResponseBuilder.system(
          "Audit log system not initialized - run Prisma migration",
          "NOT_INITIALIZED"
        ),
        503
      );
    }

    const log = await prisma.auditLog.findUnique({
      where: { id },
    });

    if (!log) {
      return c.json(
        ErrorResponseBuilder.notFound("Audit log not found"),
        404
      );
    }

    // Log the access
    await AuditLogger.logAdminAction("SENSITIVE_DATA_ACCESSED", user.userId, {
      metadata: { resource: "audit_log", logId: id },
    });

    return c.json({ log });
  } catch (error: any) {
    return c.json(
      ErrorResponseBuilder.system(
        "Failed to get audit log",
        "FETCH_FAILED",
        { error: error.message }
      ),
      500
    );
  }
});

/**
 * GET /api/admin/audit-logs/user/:userId
 * Get audit logs for a specific user
 */
auditLogsRoutes.get("/user/:userId", async (c) => {
  try {
    const user = c.get("user") as TokenPayload | undefined;

    // Only platform members can view user audit logs
    if (!user || !user.platformRole) {
      return c.json(
        ErrorResponseBuilder.authorization(
          "Unauthorized",
          "ADMIN_REQUIRED"
        ),
        403
      );
    }

    const userId = c.req.param("userId");
    const query = c.req.query();

    const filters: any = {
      actorId: userId,
      limit: query.limit ? parseInt(query.limit) : 100,
      offset: query.offset ? parseInt(query.offset) : 0,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    };

    const result = await AuditLogger.query(filters);

    // Log the access
    await AuditLogger.logAdminAction("SENSITIVE_DATA_ACCESSED", user.userId, {
      metadata: { resource: "user_audit_logs", targetUserId: userId },
    });

    return c.json({
      logs: result.logs,
      total: result.total,
      userId,
    });
  } catch (error: any) {
    return c.json(
      ErrorResponseBuilder.system(
        "Failed to get user audit logs",
        "QUERY_FAILED",
        { error: error.message }
      ),
      500
    );
  }
});

/**
 * GET /api/admin/audit-logs/organization/:orgId
 * Get audit logs for a specific organization
 */
auditLogsRoutes.get("/organization/:orgId", async (c) => {
  try {
    const user = c.get("user") as TokenPayload | undefined;

    // Only platform members can view organization audit logs
    if (!user || !user.platformRole) {
      return c.json(
        ErrorResponseBuilder.authorization(
          "Unauthorized",
          "ADMIN_REQUIRED"
        ),
        403
      );
    }

    const orgId = c.req.param("orgId");
    const query = c.req.query();

    const filters: any = {
      organizationId: orgId,
      limit: query.limit ? parseInt(query.limit) : 100,
      offset: query.offset ? parseInt(query.offset) : 0,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    };

    const result = await AuditLogger.query(filters);

    // Log the access
    await AuditLogger.logAdminAction("SENSITIVE_DATA_ACCESSED", user.userId, {
      metadata: { resource: "organization_audit_logs", organizationId: orgId },
    });

    return c.json({
      logs: result.logs,
      total: result.total,
      organizationId: orgId,
    });
  } catch (error: any) {
    return c.json(
      ErrorResponseBuilder.system(
        "Failed to get organization audit logs",
        "QUERY_FAILED",
        { error: error.message }
      ),
      500
    );
  }
});

export default auditLogsRoutes;
