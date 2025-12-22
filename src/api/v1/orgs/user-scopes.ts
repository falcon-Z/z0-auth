import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../../utils/prisma";
import { authMiddleware } from "../../../middleware/auth";

const userScopes = new Hono();

// Validation schemas
const grantScopeSchema = z.object({
  scopeId: z.string(),
  canRead: z.boolean().optional().default(true),
  canWrite: z.boolean().optional().default(false),
  canDelete: z.boolean().optional().default(false),
  canManage: z.boolean().optional().default(false),
  conditions: z.record(z.any()).optional(),
  expiresAt: z.string().datetime().optional(),
});

// Get user's direct scopes
userScopes.get(
  "/:orgId/members/:userId/scopes",
  authMiddleware,
  async (c) => {
    try {
      const { orgId, userId } = c.req.param();

      // Verify user exists and belongs to org
      const userRole = await prisma.userRole.findFirst({
        where: {
          userId,
          role: {
            organizationId: orgId,
          },
        },
        include: {
          user: true,
          role: true,
        },
      });

      if (!userRole) {
        return c.json({ error: "User not found in organization" }, 404);
      }

      // Get direct user scopes
      const directScopes = await prisma.userScope.findMany({
        where: {
          userId,
          scope: {
            organizationId: orgId,
          },
        },
        include: {
          scope: true,
        },
      });

      return c.json({
        directScopes: directScopes.map((us) => ({
          id: us.id,
          scopeId: us.scopeId,
          scopeName: us.scope.name,
          scopeDescription: us.scope.description,
          category: us.scope.category,
          canRead: us.canRead,
          canWrite: us.canWrite,
          canDelete: us.canDelete,
          canManage: us.canManage,
          conditions: us.conditions,
          expiresAt: us.expiresAt,
          createdAt: us.createdAt,
        })),
      });
    } catch (error: any) {
      console.error("Error fetching user scopes:", error);
      return c.json({ error: "Failed to fetch user scopes" }, 500);
    }
  }
);

// Grant direct scope to user
userScopes.post(
  "/:orgId/members/:userId/scopes",
  authMiddleware,
  async (c) => {
    try {
      const { orgId, userId } = c.req.param();
      const body = await c.req.json();
      const data = grantScopeSchema.parse(body);

      // Verify user exists and belongs to org
      const userRole = await prisma.userRole.findFirst({
        where: {
          userId,
          role: {
            organizationId: orgId,
          },
        },
      });

      if (!userRole) {
        return c.json({ error: "User not found in organization" }, 404);
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
      const existing = await prisma.userScope.findUnique({
        where: {
          userId_scopeId: {
            userId,
            scopeId: data.scopeId,
          },
        },
      });

      if (existing) {
        return c.json({ error: "Scope already granted to this user" }, 400);
      }

      const userScope = await prisma.userScope.create({
        data: {
          userId,
          scopeId: data.scopeId,
          canRead: data.canRead,
          canWrite: data.canWrite,
          canDelete: data.canDelete,
          canManage: data.canManage,
          conditions: data.conditions || null,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        },
        include: {
          scope: true,
        },
      });

      return c.json({ userScope }, 201);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return c.json({ error: "Validation failed", details: error.errors }, 400);
      }
      console.error("Error granting scope:", error);
      return c.json({ error: "Failed to grant scope" }, 500);
    }
  }
);

// Revoke direct scope from user
userScopes.delete(
  "/:orgId/members/:userId/scopes/:scopeId",
  authMiddleware,
  async (c) => {
    try {
      const { orgId, userId, scopeId } = c.req.param();

      // Verify user exists and belongs to org
      const userRole = await prisma.userRole.findFirst({
        where: {
          userId,
          role: {
            organizationId: orgId,
          },
        },
      });

      if (!userRole) {
        return c.json({ error: "User not found in organization" }, 404);
      }

      // Check if scope is assigned
      const existing = await prisma.userScope.findUnique({
        where: {
          userId_scopeId: {
            userId,
            scopeId,
          },
        },
      });

      if (!existing) {
        return c.json({ error: "Scope not granted to this user" }, 404);
      }

      await prisma.userScope.delete({
        where: {
          userId_scopeId: {
            userId,
            scopeId,
          },
        },
      });

      return c.json({ message: "Scope revoked from user successfully" });
    } catch (error: any) {
      console.error("Error revoking scope:", error);
      return c.json({ error: "Failed to revoke scope" }, 500);
    }
  }
);

// Get all effective scopes for a user (role + direct)
userScopes.get(
  "/:orgId/members/:userId/effective-scopes",
  authMiddleware,
  async (c) => {
    try {
      const { orgId, userId } = c.req.param();

      // Verify user exists and belongs to org
      const userRole = await prisma.userRole.findFirst({
        where: {
          userId,
          role: {
            organizationId: orgId,
          },
        },
        include: {
          role: {
            include: {
              inheritsFrom: true,
            },
          },
        },
      });

      if (!userRole) {
        return c.json({ error: "User not found in organization" }, 404);
      }

      // Get role scopes (including inherited)
      const roleIds = [userRole.roleId];
      if (userRole.role.inheritsFromId) {
        roleIds.push(userRole.role.inheritsFromId);
      }

      const roleScopes = await prisma.roleScope.findMany({
        where: {
          roleId: { in: roleIds },
        },
        include: {
          scope: true,
          role: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Get direct user scopes
      const directScopes = await prisma.userScope.findMany({
        where: {
          userId,
          scope: {
            organizationId: orgId,
          },
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        include: {
          scope: true,
        },
      });

      // Merge scopes - direct scopes override role scopes
      const scopeMap = new Map<string, any>();

      // Add role scopes first
      for (const rs of roleScopes) {
        scopeMap.set(rs.scopeId, {
          scopeId: rs.scopeId,
          scopeName: rs.scope.name,
          scopeDescription: rs.scope.description,
          category: rs.scope.category,
          canRead: rs.canRead,
          canWrite: rs.canWrite,
          canDelete: rs.canDelete,
          canManage: rs.canManage,
          conditions: rs.conditions,
          source: "role",
          roleName: rs.role.name,
        });
      }

      // Override with direct scopes
      for (const us of directScopes) {
        const existing = scopeMap.get(us.scopeId);
        scopeMap.set(us.scopeId, {
          scopeId: us.scopeId,
          scopeName: us.scope.name,
          scopeDescription: us.scope.description,
          category: us.scope.category,
          canRead: existing ? existing.canRead || us.canRead : us.canRead,
          canWrite: existing ? existing.canWrite || us.canWrite : us.canWrite,
          canDelete: existing ? existing.canDelete || us.canDelete : us.canDelete,
          canManage: existing ? existing.canManage || us.canManage : us.canManage,
          conditions: us.conditions || existing?.conditions,
          source: existing ? "both" : "direct",
          expiresAt: us.expiresAt,
        });
      }

      return c.json({
        effectiveScopes: Array.from(scopeMap.values()),
        roleId: userRole.roleId,
        roleName: userRole.role.name,
      });
    } catch (error: any) {
      console.error("Error fetching effective scopes:", error);
      return c.json({ error: "Failed to fetch effective scopes" }, 500);
    }
  }
);

export default userScopes;
