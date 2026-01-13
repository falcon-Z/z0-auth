import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../../utils/prisma";
import { authMiddleware } from "../../../middleware/auth";

const roles = new Hono();

// Validation schemas
const createRoleSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().min(1).max(500).optional(),
  level: z.number().int().min(1).max(100).optional().default(50),
  inheritsFromId: z.string().optional(),
});

const updateRoleSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
  level: z.number().int().min(1).max(100).optional(),
  inheritsFromId: z.string().optional().nullable(),
});

// List roles (including system roles)
roles.get("/:orgId/roles", authMiddleware, async (c) => {
  try {
    const orgId = c.req.param("orgId");
    const { includeSystem } = c.req.query();

    const where: any = { organizationId: orgId };

    // By default, include system roles
    // If includeSystem=false, exclude them
    if (includeSystem === "false") {
      where.builtInRole = null;
    }

    const rolesList = await prisma.role.findMany({
      where,
      orderBy: [{ level: "desc" }, { name: "asc" }],
      include: {
        inheritsFrom: {
          select: {
            id: true,
            name: true,
            level: true,
          },
        },
        _count: {
          select: {
            userRoles: true,
            roleScopes: true,
          },
        },
      },
    });

    return c.json({
      roles: rolesList.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        level: role.level,
        builtInRole: role.builtInRole,
        isSystem: role.builtInRole !== null,
        inheritsFrom: role.inheritsFrom,
        memberCount: role._count.userRoles,
        scopeCount: role._count.roleScopes,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      })),
    });
  } catch (error: any) {
    console.error("Error fetching roles:", error);
    return c.json({ error: "Failed to fetch roles" }, 500);
  }
});

// Create custom role
roles.post("/:orgId/roles", authMiddleware, async (c) => {
  try {
    const orgId = c.req.param("orgId");
    const body = await c.req.json();
    const data = createRoleSchema.parse(body);

    // Check if role name already exists in this org
    const existing = await prisma.role.findFirst({
      where: {
        organizationId: orgId,
        name: data.name,
      },
    });

    if (existing) {
      return c.json({ error: "Role with this name already exists" }, 400);
    }

    // If inheritsFromId is provided, validate it exists
    if (data.inheritsFromId) {
      const parentRole = await prisma.role.findFirst({
        where: {
          id: data.inheritsFromId,
          organizationId: orgId,
        },
      });

      if (!parentRole) {
        return c.json({ error: "Parent role not found" }, 404);
      }

      // Prevent circular inheritance by checking levels
      if (data.level && data.level >= parentRole.level) {
        return c.json(
          { error: "Child role level must be lower than parent role level" },
          400
        );
      }
    }

    const role = await prisma.role.create({
      data: {
        ...data,
        organizationId: orgId,
        builtInRole: null, // Custom roles have no builtInRole
      },
      include: {
        inheritsFrom: {
          select: {
            id: true,
            name: true,
            level: true,
          },
        },
      },
    });

    return c.json({ role }, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation failed", details: error.errors }, 400);
    }
    console.error("Error creating role:", error);
    return c.json({ error: "Failed to create role" }, 500);
  }
});

// Get single role with scopes
roles.get("/:orgId/roles/:roleId", authMiddleware, async (c) => {
  try {
    const { orgId, roleId } = c.req.param();

    const role = await prisma.role.findFirst({
      where: {
        id: roleId,
        organizationId: orgId,
      },
      include: {
        inheritsFrom: {
          select: {
            id: true,
            name: true,
            level: true,
          },
        },
        roleScopes: {
          include: {
            scope: true,
          },
        },
        _count: {
          select: {
            userRoles: true,
          },
        },
      },
    });

    if (!role) {
      return c.json({ error: "Role not found" }, 404);
    }

    return c.json({
      role: {
        ...role,
        isSystem: role.builtInRole !== null,
        memberCount: role._count.userRoles,
      },
    });
  } catch (error: any) {
    console.error("Error fetching role:", error);
    return c.json({ error: "Failed to fetch role" }, 500);
  }
});

// Update role
roles.put("/:orgId/roles/:roleId", authMiddleware, async (c) => {
  try {
    const { orgId, roleId } = c.req.param();
    const body = await c.req.json();
    const data = updateRoleSchema.parse(body);

    // Check if role exists and belongs to org
    const existing = await prisma.role.findFirst({
      where: {
        id: roleId,
        organizationId: orgId,
      },
    });

    if (!existing) {
      return c.json({ error: "Role not found" }, 404);
    }

    // Prevent modifying system roles
    if (existing.builtInRole !== null) {
      return c.json({ error: "Cannot modify system roles" }, 403);
    }

    // If name is being changed, check for duplicates
    if (data.name && data.name !== existing.name) {
      const duplicate = await prisma.role.findFirst({
        where: {
          organizationId: orgId,
          name: data.name,
          id: { not: roleId },
        },
      });

      if (duplicate) {
        return c.json({ error: "Role with this name already exists" }, 400);
      }
    }

    // If inheritsFromId is being changed, validate it
    if ("inheritsFromId" in data && data.inheritsFromId) {
      const parentRole = await prisma.role.findFirst({
        where: {
          id: data.inheritsFromId,
          organizationId: orgId,
        },
      });

      if (!parentRole) {
        return c.json({ error: "Parent role not found" }, 404);
      }

      // Prevent circular inheritance
      const newLevel = data.level ?? existing.level;
      if (newLevel >= parentRole.level) {
        return c.json(
          { error: "Child role level must be lower than parent role level" },
          400
        );
      }

      // Prevent setting self as parent
      if (data.inheritsFromId === roleId) {
        return c.json({ error: "Role cannot inherit from itself" }, 400);
      }
    }

    const role = await prisma.role.update({
      where: { id: roleId },
      data,
      include: {
        inheritsFrom: {
          select: {
            id: true,
            name: true,
            level: true,
          },
        },
      },
    });

    return c.json({ role });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation failed", details: error.errors }, 400);
    }
    console.error("Error updating role:", error);
    return c.json({ error: "Failed to update role" }, 500);
  }
});

// Delete role (only custom roles)
roles.delete("/:orgId/roles/:roleId", authMiddleware, async (c) => {
  try {
    const { orgId, roleId } = c.req.param();

    // Check if role exists and belongs to org
    const existing = await prisma.role.findFirst({
      where: {
        id: roleId,
        organizationId: orgId,
      },
      include: {
        _count: {
          select: {
            userRoles: true,
          },
        },
      },
    });

    if (!existing) {
      return c.json({ error: "Role not found" }, 404);
    }

    // Prevent deleting system roles
    if (existing.builtInRole !== null) {
      return c.json({ error: "Cannot delete system roles" }, 403);
    }

    // Check if role is assigned to users
    if (existing._count.userRoles > 0) {
      return c.json(
        {
          error: "Cannot delete role that is assigned to users",
          memberCount: existing._count.userRoles,
        },
        400
      );
    }

    // Check if other roles inherit from this role
    const childRoles = await prisma.role.count({
      where: {
        inheritsFromId: roleId,
      },
    });

    if (childRoles > 0) {
      return c.json(
        {
          error: "Cannot delete role that has child roles",
          childRoleCount: childRoles,
        },
        400
      );
    }

    await prisma.role.delete({
      where: { id: roleId },
    });

    return c.json({ message: "Role deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting role:", error);
    return c.json({ error: "Failed to delete role" }, 500);
  }
});

export default roles;
