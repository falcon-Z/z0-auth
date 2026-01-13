/**
 * Request Traces API Endpoints
 * Platform admin only - view and export request traces for debugging and compliance
 */

import { Hono } from "hono";
import { db } from "@z0/utils/db/client";
import { ErrorResponseBuilder, RequestContext, Logger } from "@z0/utils/error-handling";
import { z } from "zod";
import type { TokenPayload } from "@z0/utils/auth";
import { AuditLogger } from "@z0/utils/audit-logger";

const requestTracesRoutes = new Hono();

// Query schema for listing traces
const querySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  userId: z.string().optional(),
  appId: z.string().optional(),
  sessionId: z.string().optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]).optional(),
  path: z.string().optional(),
  statusCode: z.string().optional(),
  minDuration: z.string().optional(),
  maxDuration: z.string().optional(),
  success: z.enum(["true", "false"]).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

/**
 * Check if user is platform admin
 */
function requirePlatformAdmin(c: any): { user: TokenPayload } | null {
  const user = c.get("user") as TokenPayload | undefined;
  if (!user || !user.platformRole) {
    return null;
  }
  return { user };
}

/**
 * GET /api/admin/request-traces
 * List request traces with filters
 */
requestTracesRoutes.get("/", async (c) => {
  const requestId = RequestContext.generateRequestId();

  try {
    const auth = requirePlatformAdmin(c);
    if (!auth) {
      return c.json(
        ErrorResponseBuilder.authorization("Platform admin access required", "ADMIN_REQUIRED"),
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
          }))
        ),
        400
      );
    }

    const pageNum = Math.max(1, parseInt(parsed.data.page || "1", 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(parsed.data.limit || "50", 10)));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {};

    if (parsed.data.dateFrom) {
      where.startTime = { ...where.startTime, gte: new Date(parsed.data.dateFrom) };
    }
    if (parsed.data.dateTo) {
      where.startTime = { ...where.startTime, lte: new Date(parsed.data.dateTo) };
    }
    if (parsed.data.userId) {
      where.userId = parsed.data.userId;
    }
    if (parsed.data.appId) {
      where.appId = parsed.data.appId;
    }
    if (parsed.data.sessionId) {
      where.sessionId = parsed.data.sessionId;
    }
    if (parsed.data.method) {
      where.method = parsed.data.method;
    }
    if (parsed.data.path) {
      where.path = { contains: parsed.data.path };
    }
    if (parsed.data.statusCode) {
      where.statusCode = parseInt(parsed.data.statusCode, 10);
    }
    if (parsed.data.minDuration) {
      where.duration = { ...where.duration, gte: parseInt(parsed.data.minDuration, 10) };
    }
    if (parsed.data.maxDuration) {
      where.duration = { ...where.duration, lte: parseInt(parsed.data.maxDuration, 10) };
    }
    if (parsed.data.success !== undefined) {
      where.success = parsed.data.success === "true";
    }

    const [traces, total] = await Promise.all([
      db.requestTrace.findMany({
        where,
        orderBy: { startTime: "desc" },
        skip,
        take: limitNum,
        select: {
          id: true,
          requestId: true,
          method: true,
          path: true,
          userId: true,
          appId: true,
          sessionId: true,
          ipAddress: true,
          statusCode: true,
          duration: true,
          success: true,
          errorCode: true,
          startTime: true,
          endTime: true,
        },
      }),
      db.requestTrace.count({ where }),
    ]);

    // Log access
    await AuditLogger.logAdminAction("SENSITIVE_DATA_ACCESSED", auth.user.userId, {
      metadata: { resource: "request_traces", filters: parsed.data },
    });

    return c.json({
      success: true,
      data: traces,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      requestId,
    });
  } catch (error: any) {
    Logger.error("Failed to list request traces", { error: error.message, requestId });
    return c.json(
      ErrorResponseBuilder.system("Failed to query request traces", "QUERY_FAILED"),
      500
    );
  }
});

/**
 * GET /api/admin/request-traces/stats
 * Get request trace statistics
 */
requestTracesRoutes.get("/stats", async (c) => {
  const requestId = RequestContext.generateRequestId();

  try {
    const auth = requirePlatformAdmin(c);
    if (!auth) {
      return c.json(
        ErrorResponseBuilder.authorization("Platform admin access required", "ADMIN_REQUIRED"),
        403
      );
    }

    const query = c.req.query();
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();

    const where = {
      startTime: {
        gte: dateFrom,
        lte: dateTo,
      },
    };

    // Get aggregate statistics
    const [
      totalRequests,
      successfulRequests,
      failedRequests,
      avgDuration,
      methodCounts,
      statusCounts,
      slowestRequests,
    ] = await Promise.all([
      db.requestTrace.count({ where }),
      db.requestTrace.count({ where: { ...where, success: true } }),
      db.requestTrace.count({ where: { ...where, success: false } }),
      db.requestTrace.aggregate({
        where,
        _avg: { duration: true },
        _max: { duration: true },
        _min: { duration: true },
      }),
      db.requestTrace.groupBy({
        by: ["method"],
        where,
        _count: true,
      }),
      db.requestTrace.groupBy({
        by: ["statusCode"],
        where,
        _count: true,
        orderBy: { _count: { statusCode: "desc" } },
        take: 10,
      }),
      db.requestTrace.findMany({
        where,
        orderBy: { duration: "desc" },
        take: 10,
        select: {
          id: true,
          requestId: true,
          method: true,
          path: true,
          duration: true,
          statusCode: true,
          startTime: true,
        },
      }),
    ]);

    const stats = {
      period: {
        from: dateFrom.toISOString(),
        to: dateTo.toISOString(),
      },
      totals: {
        requests: totalRequests,
        successful: successfulRequests,
        failed: failedRequests,
        successRate: totalRequests > 0 ? ((successfulRequests / totalRequests) * 100).toFixed(2) + "%" : "N/A",
      },
      duration: {
        avg: avgDuration._avg.duration ? Math.round(avgDuration._avg.duration) : 0,
        min: avgDuration._min.duration || 0,
        max: avgDuration._max.duration || 0,
      },
      byMethod: methodCounts.reduce((acc: any, item: any) => {
        acc[item.method] = item._count;
        return acc;
      }, {}),
      byStatusCode: statusCounts.map((item: any) => ({
        statusCode: item.statusCode,
        count: item._count,
      })),
      slowestRequests,
    };

    // Log access
    await AuditLogger.logAdminAction("SENSITIVE_DATA_ACCESSED", auth.user.userId, {
      metadata: { resource: "request_trace_stats", period: { dateFrom, dateTo } },
    });

    return c.json({
      success: true,
      data: stats,
      requestId,
    });
  } catch (error: any) {
    Logger.error("Failed to get request trace stats", { error: error.message, requestId });
    return c.json(
      ErrorResponseBuilder.system("Failed to get statistics", "STATS_FAILED"),
      500
    );
  }
});

/**
 * GET /api/admin/request-traces/export
 * Export request traces as CSV or JSON
 */
requestTracesRoutes.get("/export", async (c) => {
  const requestId = RequestContext.generateRequestId();

  try {
    const auth = requirePlatformAdmin(c);
    if (!auth) {
      return c.json(
        ErrorResponseBuilder.authorization("Platform admin access required", "ADMIN_REQUIRED"),
        403
      );
    }

    const query = c.req.query();
    const format = query.format || "json";
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();
    const limit = Math.min(10000, parseInt(query.limit || "1000", 10));

    const where = {
      startTime: {
        gte: dateFrom,
        lte: dateTo,
      },
    };

    const traces = await db.requestTrace.findMany({
      where,
      orderBy: { startTime: "desc" },
      take: limit,
      select: {
        id: true,
        requestId: true,
        method: true,
        path: true,
        query: true,
        userId: true,
        appId: true,
        sessionId: true,
        ipAddress: true,
        userAgent: true,
        statusCode: true,
        duration: true,
        responseSize: true,
        success: true,
        errorCode: true,
        errorMessage: true,
        startTime: true,
        endTime: true,
      },
    });

    // Log export
    await AuditLogger.logAdminAction("DATA_EXPORTED", auth.user.userId, {
      metadata: {
        resource: "request_traces",
        format,
        recordCount: traces.length,
        period: { dateFrom, dateTo },
      },
    });

    if (format === "csv") {
      const headers = [
        "id",
        "requestId",
        "method",
        "path",
        "query",
        "userId",
        "appId",
        "sessionId",
        "ipAddress",
        "userAgent",
        "statusCode",
        "duration",
        "responseSize",
        "success",
        "errorCode",
        "errorMessage",
        "startTime",
        "endTime",
      ];

      const csvRows = [headers.join(",")];

      for (const trace of traces) {
        const row = headers.map((h) => {
          const value = (trace as any)[h];
          if (value === null || value === undefined) return "";
          if (value instanceof Date) return value.toISOString();
          if (typeof value === "string" && (value.includes(",") || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return String(value);
        });
        csvRows.push(row.join(","));
      }

      const csv = csvRows.join("\n");

      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="request-traces-${dateFrom.toISOString().split("T")[0]}-${dateTo.toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    // Default to JSON
    return c.json({
      success: true,
      data: traces,
      metadata: {
        period: {
          from: dateFrom.toISOString(),
          to: dateTo.toISOString(),
        },
        recordCount: traces.length,
        exportedAt: new Date().toISOString(),
      },
      requestId,
    });
  } catch (error: any) {
    Logger.error("Failed to export request traces", { error: error.message, requestId });
    return c.json(
      ErrorResponseBuilder.system("Failed to export traces", "EXPORT_FAILED"),
      500
    );
  }
});

/**
 * GET /api/admin/request-traces/:id
 * Get a specific request trace with full details
 */
requestTracesRoutes.get("/:id", async (c) => {
  const requestId = RequestContext.generateRequestId();
  const id = c.req.param("id");

  try {
    const auth = requirePlatformAdmin(c);
    if (!auth) {
      return c.json(
        ErrorResponseBuilder.authorization("Platform admin access required", "ADMIN_REQUIRED"),
        403
      );
    }

    const trace = await db.requestTrace.findUnique({
      where: { id },
    });

    if (!trace) {
      return c.json(ErrorResponseBuilder.notFound("Request trace not found"), 404);
    }

    // Log access
    await AuditLogger.logAdminAction("SENSITIVE_DATA_ACCESSED", auth.user.userId, {
      metadata: { resource: "request_trace", traceId: id },
    });

    return c.json({
      success: true,
      data: trace,
      requestId,
    });
  } catch (error: any) {
    Logger.error("Failed to get request trace", { error: error.message, traceId: id, requestId });
    return c.json(
      ErrorResponseBuilder.system("Failed to get request trace", "FETCH_FAILED"),
      500
    );
  }
});

/**
 * GET /api/admin/request-traces/user/:userId
 * Get request traces for a specific user
 */
requestTracesRoutes.get("/user/:userId", async (c) => {
  const requestId = RequestContext.generateRequestId();
  const userId = c.req.param("userId");

  try {
    const auth = requirePlatformAdmin(c);
    if (!auth) {
      return c.json(
        ErrorResponseBuilder.authorization("Platform admin access required", "ADMIN_REQUIRED"),
        403
      );
    }

    const query = c.req.query();
    const pageNum = Math.max(1, parseInt(query.page || "1", 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(query.limit || "50", 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: any = { userId };

    if (query.dateFrom) {
      where.startTime = { ...where.startTime, gte: new Date(query.dateFrom) };
    }
    if (query.dateTo) {
      where.startTime = { ...where.startTime, lte: new Date(query.dateTo) };
    }

    const [traces, total] = await Promise.all([
      db.requestTrace.findMany({
        where,
        orderBy: { startTime: "desc" },
        skip,
        take: limitNum,
        select: {
          id: true,
          requestId: true,
          method: true,
          path: true,
          statusCode: true,
          duration: true,
          success: true,
          startTime: true,
        },
      }),
      db.requestTrace.count({ where }),
    ]);

    // Log access
    await AuditLogger.logAdminAction("SENSITIVE_DATA_ACCESSED", auth.user.userId, {
      metadata: { resource: "user_request_traces", targetUserId: userId },
    });

    return c.json({
      success: true,
      data: traces,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      userId,
      requestId,
    });
  } catch (error: any) {
    Logger.error("Failed to get user request traces", { error: error.message, userId, requestId });
    return c.json(
      ErrorResponseBuilder.system("Failed to get user traces", "QUERY_FAILED"),
      500
    );
  }
});

/**
 * DELETE /api/admin/request-traces/cleanup
 * Clean up old request traces (retention policy)
 */
requestTracesRoutes.delete("/cleanup", async (c) => {
  const requestId = RequestContext.generateRequestId();

  try {
    const auth = requirePlatformAdmin(c);
    if (!auth) {
      return c.json(
        ErrorResponseBuilder.authorization("Platform admin access required", "ADMIN_REQUIRED"),
        403
      );
    }

    const query = c.req.query();
    const retentionDays = parseInt(query.retentionDays || "30", 10);

    if (retentionDays < 1 || retentionDays > 365) {
      return c.json(
        ErrorResponseBuilder.validation("Invalid retention days", [
          { field: "retentionDays", message: "Must be between 1 and 365 days" },
        ]),
        400
      );
    }

    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await db.requestTrace.deleteMany({
      where: {
        startTime: { lt: cutoffDate },
      },
    });

    // Log cleanup
    await AuditLogger.logAdminAction("DATA_PURGED", auth.user.userId, {
      metadata: {
        resource: "request_traces",
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        deletedCount: result.count,
      },
    });

    Logger.info("Request traces cleanup completed", {
      deletedCount: result.count,
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      userId: auth.user.userId,
      requestId,
    });

    return c.json({
      success: true,
      message: `Deleted ${result.count} request traces older than ${retentionDays} days`,
      data: {
        deletedCount: result.count,
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
      },
      requestId,
    });
  } catch (error: any) {
    Logger.error("Failed to cleanup request traces", { error: error.message, requestId });
    return c.json(
      ErrorResponseBuilder.system("Failed to cleanup traces", "CLEANUP_FAILED"),
      500
    );
  }
});

export default requestTracesRoutes;
