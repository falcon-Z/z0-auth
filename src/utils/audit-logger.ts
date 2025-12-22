/**
 * Audit Logging Utility
 * Provides comprehensive audit trail for all sensitive operations
 */

import { Context } from "hono";
import { prisma } from "./prisma";
import { Logger } from "./error-handling";

// Import Prisma types (will be available after migration)
type AuditAction = any; // Will be replaced with actual enum after migration
type AuditSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface AuditLogEntry {
  action: string; // AuditAction enum value
  severity?: AuditSeverity;
  actorId?: string;
  actorType?: "user" | "platform_manager" | "system" | "api";
  actorEmail?: string;
  targetId?: string;
  targetType?: string;
  targetEmail?: string;
  organizationId?: string;
  ipAddress?: string;
  userAgent?: string;
  status?: "success" | "failure" | "error";
  errorMessage?: string;
  metadata?: Record<string, any>;
  requestId?: string;
  sessionId?: string;
  deviceId?: string;
  location?: string;
}

export class AuditLogger {
  /**
   * Log an audit event
   */
  static async log(entry: AuditLogEntry): Promise<void> {
    try {
      // Check if auditLog model exists (after migration)
      if (!prisma.auditLog) {
        Logger.warn("AuditLog model not available yet - run Prisma migration");
        // Log to console/file for now
        Logger.info("AUDIT LOG", entry);
        return;
      }

      await prisma.auditLog.create({
        data: {
          action: entry.action as any,
          severity: (entry.severity || "MEDIUM") as any,
          actorId: entry.actorId,
          actorType: entry.actorType,
          actorEmail: entry.actorEmail,
          targetId: entry.targetId,
          targetType: entry.targetType,
          targetEmail: entry.targetEmail,
          organizationId: entry.organizationId,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          status: entry.status || "success",
          errorMessage: entry.errorMessage,
          metadata: entry.metadata as any,
          requestId: entry.requestId,
          sessionId: entry.sessionId,
          deviceId: entry.deviceId,
          location: entry.location,
        },
      });

      // Also log to application logger for immediate visibility
      Logger.info("AUDIT", {
        action: entry.action,
        actor: entry.actorId,
        target: entry.targetId,
        status: entry.status,
      });
    } catch (error: any) {
      // Critical: audit logging should never fail the main operation
      Logger.error("Failed to write audit log", {
        error: error.message,
        entry,
      });
    }
  }

  /**
   * Extract common audit context from HTTP request
   */
  static getContextFromRequest(c: Context): Pick<AuditLogEntry, "ipAddress" | "userAgent" | "requestId"> {
    return {
      ipAddress:
        c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
        c.req.header("x-real-ip") ||
        c.req.header("cf-connecting-ip") ||
        "unknown",
      userAgent: c.req.header("user-agent") || "unknown",
      requestId: c.get("requestId") || undefined,
    };
  }

  /**
   * Log authentication event
   */
  static async logAuth(
    action: string,
    c: Context,
    userId?: string,
    email?: string,
    options?: Partial<AuditLogEntry>
  ): Promise<void> {
    const context = this.getContextFromRequest(c);

    await this.log({
      action,
      severity: action.includes("FAILED") ? "HIGH" : "MEDIUM",
      actorId: userId,
      actorEmail: email,
      ...context,
      ...options,
    });
  }

  /**
   * Log user management event
   */
  static async logUserManagement(
    action: string,
    actorId: string,
    targetUserId: string,
    targetEmail?: string,
    options?: Partial<AuditLogEntry>
  ): Promise<void> {
    await this.log({
      action,
      severity: action.includes("DELETE") ? "HIGH" : "MEDIUM",
      actorId,
      targetId: targetUserId,
      targetType: "user",
      targetEmail,
      ...options,
    });
  }

  /**
   * Log organization management event
   */
  static async logOrganizationManagement(
    action: string,
    actorId: string,
    organizationId: string,
    options?: Partial<AuditLogEntry>
  ): Promise<void> {
    await this.log({
      action,
      severity: action.includes("DELETE") ? "HIGH" : "MEDIUM",
      actorId,
      targetId: organizationId,
      targetType: "organization",
      organizationId,
      ...options,
    });
  }

  /**
   * Log role/permission change
   */
  static async logPermissionChange(
    action: string,
    actorId: string,
    targetId: string,
    targetType: string,
    options?: Partial<AuditLogEntry>
  ): Promise<void> {
    await this.log({
      action,
      severity: "HIGH",
      actorId,
      targetId,
      targetType,
      ...options,
    });
  }

  /**
   * Log security event
   */
  static async logSecurityEvent(
    action: string,
    c: Context,
    userId?: string,
    options?: Partial<AuditLogEntry>
  ): Promise<void> {
    const context = this.getContextFromRequest(c);

    await this.log({
      action,
      severity: "CRITICAL",
      actorId: userId,
      ...context,
      ...options,
    });
  }

  /**
   * Log sensitive data access
   */
  static async logDataAccess(
    action: string,
    actorId: string,
    resourceId: string,
    resourceType: string,
    options?: Partial<AuditLogEntry>
  ): Promise<void> {
    await this.log({
      action,
      severity: "HIGH",
      actorId,
      targetId: resourceId,
      targetType: resourceType,
      ...options,
    });
  }

  /**
   * Log admin action
   */
  static async logAdminAction(
    action: string,
    actorId: string,
    options?: Partial<AuditLogEntry>
  ): Promise<void> {
    await this.log({
      action,
      severity: "HIGH",
      actorId,
      actorType: "platform_manager",
      ...options,
    });
  }

  /**
   * Query audit logs with filters
   */
  static async query(filters: {
    action?: string;
    actorId?: string;
    targetId?: string;
    organizationId?: string;
    severity?: AuditSeverity;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    try {
      if (!prisma.auditLog) {
        Logger.warn("AuditLog model not available yet - run Prisma migration");
        return { logs: [], total: 0 };
      }

      const where: any = {};

      if (filters.action) where.action = filters.action;
      if (filters.actorId) where.actorId = filters.actorId;
      if (filters.targetId) where.targetId = filters.targetId;
      if (filters.organizationId) where.organizationId = filters.organizationId;
      if (filters.severity) where.severity = filters.severity;

      if (filters.startDate || filters.endDate) {
        where.createdAt = {};
        if (filters.startDate) where.createdAt.gte = filters.startDate;
        if (filters.endDate) where.createdAt.lte = filters.endDate;
      }

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: filters.limit || 100,
          skip: filters.offset || 0,
        }),
        prisma.auditLog.count({ where }),
      ]);

      return { logs, total };
    } catch (error: any) {
      Logger.error("Failed to query audit logs", { error: error.message, filters });
      throw error;
    }
  }

  /**
   * Get audit log statistics
   */
  static async getStatistics(options: {
    organizationId?: string;
    actorId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    try {
      if (!prisma.auditLog) {
        Logger.warn("AuditLog model not available yet - run Prisma migration");
        return null;
      }

      const where: any = {};
      if (options.organizationId) where.organizationId = options.organizationId;
      if (options.actorId) where.actorId = options.actorId;
      if (options.startDate || options.endDate) {
        where.createdAt = {};
        if (options.startDate) where.createdAt.gte = options.startDate;
        if (options.endDate) where.createdAt.lte = options.endDate;
      }

      const [
        totalLogs,
        byAction,
        bySeverity,
        byStatus,
        criticalEvents,
      ] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.groupBy({
          by: ["action"],
          where,
          _count: { action: true },
          orderBy: { _count: { action: "desc" } },
          take: 10,
        }),
        prisma.auditLog.groupBy({
          by: ["severity"],
          where,
          _count: { severity: true },
        }),
        prisma.auditLog.groupBy({
          by: ["status"],
          where,
          _count: { status: true },
        }),
        prisma.auditLog.count({
          where: { ...where, severity: "CRITICAL" },
        }),
      ]);

      return {
        totalLogs,
        criticalEvents,
        byAction,
        bySeverity,
        byStatus,
      };
    } catch (error: any) {
      Logger.error("Failed to get audit statistics", { error: error.message, options });
      throw error;
    }
  }
}

// Export convenience functions
export const auditLog = AuditLogger.log.bind(AuditLogger);
export const auditAuth = AuditLogger.logAuth.bind(AuditLogger);
export const auditUserManagement = AuditLogger.logUserManagement.bind(AuditLogger);
export const auditOrganizationManagement = AuditLogger.logOrganizationManagement.bind(AuditLogger);
export const auditPermissionChange = AuditLogger.logPermissionChange.bind(AuditLogger);
export const auditSecurityEvent = AuditLogger.logSecurityEvent.bind(AuditLogger);
export const auditDataAccess = AuditLogger.logDataAccess.bind(AuditLogger);
export const auditAdminAction = AuditLogger.logAdminAction.bind(AuditLogger);
