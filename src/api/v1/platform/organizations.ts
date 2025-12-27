/**
 * Platform Organizations API
 *
 * Platform-level management of organizations.
 * Requires platform access (PlatformMembership).
 */

import { Hono } from "hono";
import { db } from "@z0/utils/db/client";
import {
  Logger,
  DatabaseErrorHandler,
  ErrorResponseBuilder,
  RequestContext,
} from "@z0/utils/error-handling";
import { z } from "zod";
import { validator } from "hono/validator";
import type { TokenPayload } from "@z0/utils/auth";
import { requirePlatformScope } from "./middleware";

const platformOrgs = new Hono();

// Schema for creating an organization
const createOrgSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
});

// Schema for updating an organization
const updateOrgSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes")
    .optional(),
  maxUsers: z.number().int().positive().optional(),
  maxApps: z.number().int().positive().optional(),
});

// Schema for status change
const statusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

/**
 * GET /api/v1/platform/organizations
 * List all organizations
 */
platformOrgs.get("/", async (c) => {
  const requestId = RequestContext.generateRequestId();

  try {
    const orgs = await db.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            memberships: { where: { isActive: true } },
            apps: true,
          },
        },
      },
    });

    // Transform for response
    const data = orgs.map((org) => ({
      ...org,
      memberCount: org._count.memberships,
      appCount: org._count.apps,
      _count: undefined,
    }));

    return c.json({
      success: true,
      data,
      requestId,
    });
  } catch (error) {
    const dbError = DatabaseErrorHandler.handleError(error);
    return c.json(
      ErrorResponseBuilder.database("Failed to fetch organizations", dbError.code),
      500
    );
  }
});

/**
 * POST /api/v1/platform/organizations
 * Create a new organization
 */
platformOrgs.post(
  "/",
  requirePlatformScope("platform:organizations:write"),
  validator("json", (value, c) => {
    const parsed = createOrgSchema.safeParse(value);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
        code: i.code,
      }));
      return c.json(
        ErrorResponseBuilder.validation("Invalid organization data", issues),
        400
      );
    }
    return parsed.data;
  }),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const data = c.req.valid("json");
    const user = c.get("user") as TokenPayload;

    try {
      const newOrg = await db.organization.create({
        data: {
          name: data.name,
          slug: data.slug,
        },
      });

      Logger.info("Organization created", {
        orgId: newOrg.id,
        createdBy: user.userId,
        requestId,
      });

      return c.json(
        {
          success: true,
          message: "Organization created successfully",
          data: newOrg,
          requestId,
        },
        201
      );
    } catch (error) {
      const dbError = DatabaseErrorHandler.handleError(error);
      if (dbError.code === "DB_UNIQUE_CONSTRAINT") {
        return c.json(
          ErrorResponseBuilder.conflict("Organization with this slug already exists"),
          409
        );
      }
      return c.json(
        ErrorResponseBuilder.database("Failed to create organization", dbError.code),
        500
      );
    }
  }
);

/**
 * GET /api/v1/platform/organizations/:id
 * Get organization details
 */
platformOrgs.get("/:id", async (c) => {
  const id = c.req.param("id");
  const requestId = RequestContext.generateRequestId();

  try {
    const org = await db.organization.findUnique({
      where: { id },
      include: {
        memberships: {
          where: { isActive: true },
          take: 10,
          include: {
            user: {
              select: { id: true, name: true, email: true, avatar: true },
            },
          },
          orderBy: { grantedAt: "desc" },
        },
        apps: {
          take: 10,
          select: {
            id: true,
            name: true,
            status: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            memberships: { where: { isActive: true } },
            apps: true,
          },
        },
      },
    });

    if (!org) {
      return c.json(ErrorResponseBuilder.notFound("Organization not found"), 404);
    }

    // Find owners
    const owners = org.memberships
      .filter((m) => m.roleType === "ORG_OWNER")
      .map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        avatar: m.user.avatar,
      }));

    return c.json({
      success: true,
      data: {
        ...org,
        owners,
        memberCount: org._count.memberships,
        appCount: org._count.apps,
        memberships: org.memberships.map((m) => ({
          membershipId: m.id,
          userId: m.userId,
          name: m.user.name,
          email: m.user.email,
          avatar: m.user.avatar,
          roleType: m.roleType,
          grantedAt: m.grantedAt,
        })),
        _count: undefined,
      },
      requestId,
    });
  } catch (error) {
    return c.json(
      ErrorResponseBuilder.system("Failed to fetch organization details", "SYSTEM_ERROR"),
      500
    );
  }
});

/**
 * PUT /api/v1/platform/organizations/:id
 * Update organization
 */
platformOrgs.put(
  "/:id",
  requirePlatformScope("platform:organizations:write"),
  validator("json", (value, c) => {
    const parsed = updateOrgSchema.safeParse(value);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
        code: i.code,
      }));
      return c.json(
        ErrorResponseBuilder.validation("Invalid organization data", issues),
        400
      );
    }
    return parsed.data;
  }),
  async (c) => {
    const id = c.req.param("id");
    const requestId = RequestContext.generateRequestId();
    const data = c.req.valid("json");
    const user = c.get("user") as TokenPayload;

    try {
      const existingOrg = await db.organization.findUnique({ where: { id } });
      if (!existingOrg) {
        return c.json(ErrorResponseBuilder.notFound("Organization not found"), 404);
      }

      const updatedOrg = await db.organization.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.slug && { slug: data.slug }),
          ...(data.maxUsers && { maxUsers: data.maxUsers }),
          ...(data.maxApps && { maxApps: data.maxApps }),
        },
      });

      Logger.info("Organization updated", {
        orgId: id,
        updatedBy: user.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: "Organization updated successfully",
        data: updatedOrg,
        requestId,
      });
    } catch (error) {
      const dbError = DatabaseErrorHandler.handleError(error);
      if (dbError.code === "DB_UNIQUE_CONSTRAINT") {
        return c.json(
          ErrorResponseBuilder.conflict("Organization with this slug already exists"),
          409
        );
      }
      return c.json(
        ErrorResponseBuilder.database("Failed to update organization", dbError.code),
        500
      );
    }
  }
);

/**
 * PATCH /api/v1/platform/organizations/:id/status
 * Change organization status
 */
platformOrgs.patch(
  "/:id/status",
  requirePlatformScope("platform:organizations:write"),
  validator("json", (value, c) => {
    const parsed = statusSchema.safeParse(value);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
        code: i.code,
      }));
      return c.json(ErrorResponseBuilder.validation("Invalid status", issues), 400);
    }
    return parsed.data;
  }),
  async (c) => {
    const id = c.req.param("id");
    const requestId = RequestContext.generateRequestId();
    const { status } = c.req.valid("json");
    const user = c.get("user") as TokenPayload;

    try {
      const existingOrg = await db.organization.findUnique({ where: { id } });
      if (!existingOrg) {
        return c.json(ErrorResponseBuilder.notFound("Organization not found"), 404);
      }

      const updatedOrg = await db.organization.update({
        where: { id },
        data: { status },
      });

      Logger.info("Organization status changed", {
        orgId: id,
        oldStatus: existingOrg.status,
        newStatus: status,
        changedBy: user.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: `Organization status changed to ${status}`,
        data: updatedOrg,
        requestId,
      });
    } catch (error) {
      return c.json(
        ErrorResponseBuilder.system("Failed to update organization status", "SYSTEM_ERROR"),
        500
      );
    }
  }
);

/**
 * DELETE /api/v1/platform/organizations/:id
 * Soft delete organization (set status to INACTIVE)
 */
platformOrgs.delete(
  "/:id",
  requirePlatformScope("platform:organizations:delete"),
  async (c) => {
    const id = c.req.param("id");
    const requestId = RequestContext.generateRequestId();
    const user = c.get("user") as TokenPayload;

    try {
      const existingOrg = await db.organization.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              memberships: { where: { isActive: true } },
              apps: true,
            },
          },
        },
      });

      if (!existingOrg) {
        return c.json(ErrorResponseBuilder.notFound("Organization not found"), 404);
      }

      // Soft delete by setting status to INACTIVE
      const deletedOrg = await db.organization.update({
        where: { id },
        data: { status: "INACTIVE" },
      });

      Logger.info("Organization deleted", {
        orgId: id,
        deletedBy: user.userId,
        memberCount: existingOrg._count.memberships,
        appCount: existingOrg._count.apps,
        requestId,
      });

      return c.json({
        success: true,
        message: "Organization deleted successfully",
        data: {
          id: deletedOrg.id,
          status: deletedOrg.status,
        },
        requestId,
      });
    } catch (error) {
      return c.json(
        ErrorResponseBuilder.system("Failed to delete organization", "SYSTEM_ERROR"),
        500
      );
    }
  }
);

/**
 * GET /api/v1/platform/organizations/:id/stats
 * Get organization statistics
 */
platformOrgs.get("/:id/stats", async (c) => {
  const id = c.req.param("id");
  const requestId = RequestContext.generateRequestId();

  try {
    const org = await db.organization.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            memberships: true,
            apps: true,
          },
        },
      },
    });

    if (!org) {
      return c.json(ErrorResponseBuilder.notFound("Organization not found"), 404);
    }

    // Get detailed statistics using memberships
    const [activeMembers, ownerCount, adminCount, activeApps] = await Promise.all([
      db.organizationMembership.count({
        where: { organizationId: id, isActive: true },
      }),
      db.organizationMembership.count({
        where: { organizationId: id, roleType: "ORG_OWNER", isActive: true },
      }),
      db.organizationMembership.count({
        where: { organizationId: id, roleType: "ORG_ADMIN", isActive: true },
      }),
      db.app.count({ where: { organizationId: id, status: "ACTIVE" } }),
    ]);

    return c.json({
      success: true,
      data: {
        organization: {
          id: org.id,
          name: org.name,
          status: org.status,
          createdAt: org.createdAt,
        },
        stats: {
          totalMembers: org._count.memberships,
          activeMembers,
          ownerCount,
          adminCount,
          totalApps: org._count.apps,
          activeApps,
          maxUsers: org.maxUsers,
          maxApps: org.maxApps,
          usagePercent: {
            users: org.maxUsers
              ? Math.round((activeMembers / org.maxUsers) * 100)
              : null,
            apps: org.maxApps
              ? Math.round((org._count.apps / org.maxApps) * 100)
              : null,
          },
        },
      },
      requestId,
    });
  } catch (error) {
    return c.json(
      ErrorResponseBuilder.system("Failed to fetch organization stats", "SYSTEM_ERROR"),
      500
    );
  }
});

export default platformOrgs;
