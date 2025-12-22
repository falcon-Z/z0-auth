import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../../utils/prisma";
import { authMiddleware } from "../../../middleware/auth";

const roleScopes = new Hono();

// Validation schemas
const assignScopeSchema = z.object({
  scopeId: z.string(),
  canRead: z.boolean().optional().default(true),
  canWrite: z.boolean().optional().default(false),
  canDelete: z.boolean().optional().default(false),
  canManage: z.boolean().optional().default(false),
  conditions: z.record(z.any()).optional(),
});

const updatePermissionSchema = z.object({
  canRead: z.boolean().optional(),
  canWrite: z.boolean().optional(),
  canDelete: z.boolean().optional(),
  canManage: z.boolean().optional(),
  conditions: z.record(z.any()).optional(),
});

const bulkUpdateSchema = z.object({
  scopes: z.array(
    z.object({
      scopeId: z.string(),
      canRead: z.boolean().optional().default(true),
      canWrite: z.boolean().optional().default(false),
      canDelete: z.boolean().optional().default(false),
      canManage: z.boolean().optional().default(false),
      conditions: z.record(z.any()).optional(),
    })
  ),
});

// Get role's scopes
roleScopes.get("/:orgId/roles/:roleId/scopes", authMiddleware, async (c) => {
  try {
    const { orgId, roleId } = c.req.param();

    // Verify role exists and belongs to org
    const role = await prisma.role.findFirst({
      where: {
        id: roleId,
        organizationId: orgId,
      },
    });

    if (!role) {
      return c.json({ error: "Role not found" }, 404);
    }

    // Get direct scopes
    const directScopes = await prisma.roleScope.findMany({
      where: { roleId },
      include: {
        scope: true,
      },
    });

    // Get inherited scopes if role has parent
    let inheritedScopes: any[] = [];
    if (role.inheritsFromId) {
      inheritedScopes = await prisma.roleScope.findMany({
        where: { roleId: role.inheritsFromId },
        include: {
          scope: true,
        },
      });
    }

    return c.json({
      directScopes: directScopes.map((rs) => ({
        id: rs.id,
        scopeId: rs.scopeId,
        scopeName: rs.scope.name,
        scopeDescription: rs.scope.description,
        category: rs.scope.category,
        canRead: rs.canRead,
        canWrite: rs.canWrite,
        canDelete: rs.canDelete,
        canManage: rs.canManage,
        conditions: rs.conditions,
        createdAt: rs.createdAt,
      })),
      inheritedScopes: inheritedScopes.map((rs) => ({
        id: rs.id,
        scopeId: rs.scopeId,
        scopeName: rs.scope.name,
        scopeDescription: rs.scope.description,
        category: rs.scope.category,
        canRead: rs.canRead,
        canWrite: rs.canWrite,
        canDelete: rs.canDelete,
        canManage: rs.canManage,
        conditions: rs.conditions,
        inheritedFrom: role.inheritsFromId,
      })),
    });
  } catch (error: any) {
    console.error("Error fetching role scopes:", error);
    return c.json({ error: "Failed to fetch role scopes" }, 500);
  }
});

// Assign scope to role
roleScopes.post("/:orgId/roles/:roleId/scopes", authMiddleware, async (c) => {
  try {
    const { orgId, roleId } = c.req.param();
    const body = await c.req.json();
    const data = assignScopeSchema.parse(body);

    // Verify role exists and belongs to org
    const role = await prisma.role.findFirst({
      where: {
        id: roleId,
        organizationId: orgId,
      },
    });

    if (!role) {
      return c.json({ error: "Role not found" }, 404);
    }

    // Prevent modifying system roles
    if (role.builtInRole !== null) {
      return c.json({ error: "Cannot modify system role permissions" }, 403);
    }

    // Verify scope exists and belongs to org
    const scope = await prisma.scope.findFirst({
      where: {
        id: data.scopeId,
        organizationId: orgId,
      },
    });

    if (!scope) {
      return c.json({ error: "Scope not found" }, 404);
    }

    // Check if already assigned
    const existing = await prisma.roleScope.findUnique({
      where: {
        roleId_scopeId: {
          roleId,
          scopeId: data.scopeId,
        },
      },
    });

    if (existing) {
      return c.json({ error: "Scope already assigned to this role" }, 400);
    }

    const roleScope = await prisma.roleScope.create({
      data: {
        roleId,
        scopeId: data.scopeId,
        canRead: data.canRead,
        canWrite: data.canWrite,
        canDelete: data.canDelete,
        canManage: data.canManage,
        conditions: data.conditions || null,
      },
      include: {
        scope: true,
      },
    });

    return c.json({ roleScope }, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation failed", details: error.errors }, 400);
    }
    console.error("Error assigning scope:", error);
    return c.json({ error: "Failed to assign scope" }, 500);
  }
});

// Update role-scope permissions
roleScopes.put(
  "/:orgId/roles/:roleId/scopes/:scopeId",
  authMiddleware,
  async (c) => {
    try {
      const { orgId, roleId, scopeId } = c.req.param();
      const body = await c.req.json();
      const data = updatePermissionSchema.parse(body);

      // Verify role exists and belongs to org
      const role = await prisma.role.findFirst({
        where: {
          id: roleId,
          organizationId: orgId,
        },
      });

      if (!role) {
        return c.json({ error: "Role not found" }, 404);
      }

      // Prevent modifying system roles
      if (role.builtInRole !== null) {
        return c.json({ error: "Cannot modify system role permissions" }, 403);
      }

      // Check if assignment exists
      const existing = await prisma.roleScope.findUnique({
        where: {
          roleId_scopeId: {
            roleId,
            scopeId,
          },
        },
      });

      if (!existing) {
        return c.json({ error: "Scope not assigned to this role" }, 404);
      }

      const roleScope = await prisma.roleScope.update({
        where: {
          roleId_scopeId: {
            roleId,
            scopeId,
          },
        },
        data,
        include: {
          scope: true,
        },
      });

      return c.json({ roleScope });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return c.json({ error: "Validation failed", details: error.errors }, 400);
      }
      console.error("Error updating role scope:", error);
      return c.json({ error: "Failed to update role scope" }, 500);
    }
  }
);

// Remove scope from role
roleScopes.delete(
  "/:orgId/roles/:roleId/scopes/:scopeId",
  authMiddleware,
  async (c) => {
    try {
      const { orgId, roleId, scopeId } = c.req.param();

      // Verify role exists and belongs to org
      const role = await prisma.role.findFirst({
        where: {
          id: roleId,
          organizationId: orgId,
        },
      });

      if (!role) {
        return c.json({ error: "Role not found" }, 404);
      }

      // Prevent modifying system roles
      if (role.builtInRole !== null) {
        return c.json({ error: "Cannot modify system role permissions" }, 403);
      }

      // Check if assignment exists
      const existing = await prisma.roleScope.findUnique({
        where: {
          roleId_scopeId: {
            roleId,
            scopeId,
          },
        },
      });

      if (!existing) {
        return c.json({ error: "Scope not assigned to this role" }, 404);
      }

      await prisma.roleScope.delete({
        where: {
          roleId_scopeId: {
            roleId,
            scopeId,
          },
        },
      });

      return c.json({ message: "Scope removed from role successfully" });
    } catch (error: any) {
      console.error("Error removing scope:", error);
      return c.json({ error: "Failed to remove scope" }, 500);
    }
  }
);

// Bulk update scopes for a role
roleScopes.put("/:orgId/roles/:roleId/scopes/bulk", authMiddleware, async (c) => {
  try {
    const { orgId, roleId } = c.req.param();
    const body = await c.req.json();
    const data = bulkUpdateSchema.parse(body);

    // Verify role exists and belongs to org
    const role = await prisma.role.findFirst({
      where: {
        id: roleId,
        organizationId: orgId,
      },
    });

    if (!role) {
      return c.json({ error: "Role not found" }, 404);
    }

    // Prevent modifying system roles
    if (role.builtInRole !== null) {
      return c.json({ error: "Cannot modify system role permissions" }, 403);
    }

    // Verify all scopes exist and belong to org
    const scopeIds = data.scopes.map((s) => s.scopeId);
    const scopes = await prisma.scope.findMany({
      where: {
        id: { in: scopeIds },
        organizationId: orgId,
      },
    });

    if (scopes.length !== scopeIds.length) {
      return c.json({ error: "One or more scopes not found" }, 404);
    }

    // Remove existing role-scope assignments
    await prisma.roleScope.deleteMany({
      where: { roleId },
    });

    // Create new assignments
    const roleScopeData = data.scopes.map((scope) => ({
      roleId,
      scopeId: scope.scopeId,
      canRead: scope.canRead ?? true,
      canWrite: scope.canWrite ?? false,
      canDelete: scope.canDelete ?? false,
      canManage: scope.canManage ?? false,
      conditions: scope.conditions || null,
    }));

    await prisma.roleScope.createMany({
      data: roleScopeData,
    });

    // Fetch updated role scopes
    const updatedScopes = await prisma.roleScope.findMany({
      where: { roleId },
      include: {
        scope: true,
      },
    });

    return c.json({
      roleScopes: updatedScopes,
      message: "Role scopes updated successfully",
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation failed", details: error.errors }, 400);
    }
    console.error("Error bulk updating role scopes:", error);
    return c.json({ error: "Failed to bulk update role scopes" }, 500);
  }
});

export default roleScopes;
