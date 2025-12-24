import { Hono } from "hono";
import { prisma } from "../../../utils/prisma";
import { validator } from "hono/validator";
import { z } from "zod";
import { AuditLogger } from "../../../utils/audit-logger";
import { ErrorResponseBuilder } from "../../../utils/error-handling";
import type { TokenPayload } from "@z0/utils/auth";
import { hasScope } from "@z0/utils/scopes";

const orgCrudRoutes = new Hono();

/**
 * GET /api/v1/orgs
 * List all organizations (platform admin only)
 */
orgCrudRoutes.get("/", async (c) => {
  try {
    const user = c.get("user") as TokenPayload | undefined;

    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Only platform admins can list all organizations
    if (!user.platformRole || !hasScope(user.effectiveScopes, "platform:organizations:read")) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const organizations = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        status: true,
        maxUsers: true,
        maxApps: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            memberships: true,
            apps: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return c.json({
      organizations: organizations.map((org) => ({
        ...org,
        userCount: org._count.memberships,
        appCount: org._count.apps,
      })),
    });
  } catch (error: any) {
    console.error("Error fetching organizations:", error);
    return c.json({ error: "Failed to fetch organizations" }, 500);
  }
});

/**
 * GET /api/v1/orgs/:orgId
 * Get organization details
 */
orgCrudRoutes.get("/:orgId", async (c) => {
  try {
    const user = c.get("user") as TokenPayload | undefined;
    const orgId = c.req.param("orgId");

    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Check if user has access to this organization
    const hasAccess =
      // Platform member with org read access
      (user.platformRole && hasScope(user.effectiveScopes, "platform:organizations:read")) ||
      // User's current org context matches
      user.orgContext?.orgId === orgId;

    if (!hasAccess) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        _count: {
          select: {
            memberships: true,
            apps: true,
            scopes: true,
            roles: true,
          },
        },
      },
    });

    if (!organization) {
      return c.json({ error: "Organization not found" }, 404);
    }

    return c.json({
      organization: {
        ...organization,
        userCount: organization._count.memberships,
        appCount: organization._count.apps,
        scopeCount: organization._count.scopes,
        roleCount: organization._count.roles,
      },
    });
  } catch (error: any) {
    console.error("Error fetching organization:", error);
    return c.json({ error: "Failed to fetch organization" }, 500);
  }
});

const createOrgSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().optional(),
  maxUsers: z.number().optional(),
  maxApps: z.number().optional(),
});

/**
 * POST /api/v1/orgs
 * Create a new organization (platform admin only)
 */
orgCrudRoutes.post(
  "/",
  validator("json", (value, c) => {
    const parsed = createOrgSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid organization data",
          parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
            code: i.code,
          }))
        ),
        400
      );
    }
    return parsed.data;
  }),
  async (c) => {
  try {
    const user = c.get("user") as TokenPayload | undefined;

    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Only platform admins with write permission can create organizations
    if (!user.platformRole || !hasScope(user.effectiveScopes, "platform:organizations:write")) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const data = c.req.valid("json");

    // Check if slug already exists
    const existing = await prisma.organization.findUnique({
      where: { slug: data.slug },
    });

    if (existing) {
      return c.json({ error: "Organization slug already exists" }, 400);
    }

    const organization = await prisma.organization.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        maxUsers: data.maxUsers,
        maxApps: data.maxApps,
        status: "ACTIVE",
      },
    });

    // Log audit trail
    await AuditLogger.logOrganizationManagement(
      "ORGANIZATION_CREATED",
      user.userId,
      organization.id,
      {
        actorType: "platform_manager",
        severity: "HIGH",
        metadata: {
          name: organization.name,
          slug: organization.slug,
          maxUsers: organization.maxUsers,
          maxApps: organization.maxApps,
          platformRole: user.platformRole,
        }
      }
    );

    return c.json({ organization }, 201);
  } catch (error: any) {
    console.error("Error creating organization:", error);
    return c.json({ error: "Failed to create organization" }, 500);
  }
});

const updateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]).optional(),
  maxUsers: z.number().optional(),
  maxApps: z.number().optional(),
});

/**
 * PATCH /api/v1/orgs/:orgId
 * Update organization
 */
orgCrudRoutes.patch(
  "/:orgId",
  validator("json", (value, c) => {
    const parsed = updateOrgSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid update data",
          parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
            code: i.code,
          }))
        ),
        400
      );
    }
    return parsed.data;
  }),
  async (c) => {
    try {
      const user = c.get("user") as TokenPayload | undefined;
      const orgId = c.req.param("orgId");

      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Only platform admins with write permission can update organizations
      if (!user.platformRole || !hasScope(user.effectiveScopes, "platform:organizations:write")) {
        return c.json({ error: "Forbidden" }, 403);
      }

      const data = c.req.valid("json");

      // Fetch current data for audit trail
      const current = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true, description: true, status: true, maxUsers: true, maxApps: true }
      });

      const organization = await prisma.organization.update({
        where: { id: orgId },
        data,
      });

      // Log audit trail with changes
      const changes: any = {};
      if (data.name && data.name !== current?.name) changes.name = { from: current?.name, to: data.name };
      if (data.description !== undefined && data.description !== current?.description) changes.description = { from: current?.description, to: data.description };
      if (data.status && data.status !== current?.status) changes.status = { from: current?.status, to: data.status };
      if (data.maxUsers !== undefined && data.maxUsers !== current?.maxUsers) changes.maxUsers = { from: current?.maxUsers, to: data.maxUsers };
      if (data.maxApps !== undefined && data.maxApps !== current?.maxApps) changes.maxApps = { from: current?.maxApps, to: data.maxApps };

      await AuditLogger.logOrganizationManagement(
        "ORGANIZATION_UPDATED",
        user.userId,
        orgId,
        {
          actorType: "platform_manager",
          severity: data.status === "SUSPENDED" || current?.status === "SUSPENDED" ? "CRITICAL" : "HIGH",
          metadata: { changes, platformRole: user.platformRole }
        }
      );

      return c.json({ organization });
    } catch (error: any) {
      console.error("Error updating organization:", error);
      if (error.code === "P2025") {
        return c.json({ error: "Organization not found" }, 404);
      }
      return c.json({ error: "Failed to update organization" }, 500);
    }
  }
);

/**
 * DELETE /api/v1/orgs/:orgId
 * Delete organization (platform admin only)
 */
orgCrudRoutes.delete("/:orgId", async (c) => {
  try {
    const user = c.get("user") as TokenPayload | undefined;
    const orgId = c.req.param("orgId");

    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Only platform admins with delete permission can delete organizations
    if (!user.platformRole || !hasScope(user.effectiveScopes, "platform:organizations:delete")) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // Fetch organization details for audit trail
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, slug: true, _count: { select: { memberships: true, apps: true } } }
    });

    if (!organization) {
      return c.json({ error: "Organization not found" }, 404);
    }

    await prisma.organization.delete({
      where: { id: orgId },
    });

    // Log audit trail
    await AuditLogger.logOrganizationManagement(
      "ORGANIZATION_DELETED",
      user.userId,
      orgId,
      {
        actorType: "platform_manager",
        severity: "CRITICAL",
        metadata: {
          name: organization.name,
          slug: organization.slug,
          userCount: organization._count.memberships,
          appCount: organization._count.apps,
          platformRole: user.platformRole,
        }
      }
    );

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting organization:", error);
    if (error.code === "P2025") {
      return c.json({ error: "Organization not found" }, 404);
    }
    return c.json({ error: "Failed to delete organization" }, 500);
  }
});

export default orgCrudRoutes;
