import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../../utils/prisma";
import { authMiddleware } from "../../../middleware/auth";

const scopes = new Hono();

// Validation schemas
const createScopeSchema = z.object({
  name: z.string().min(2).max(50).regex(/^[a-z0-9_]+$/),
  description: z.string().min(1).max(500),
  category: z.string().min(2).max(50),
  isSystem: z.boolean().optional().default(false),
});

const updateScopeSchema = z.object({
  name: z.string().min(2).max(50).regex(/^[a-z0-9_]+$/).optional(),
  description: z.string().min(1).max(500).optional(),
  category: z.string().min(2).max(50).optional(),
});

// List scopes with optional filters
scopes.get("/:orgId/scopes", authMiddleware, async (c) => {
  try {
    const orgId = c.req.param("orgId");
    const { category, search } = c.req.query();

    // Build filter conditions
    const where: any = { organizationId: orgId };

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const scopesList = await prisma.scope.findMany({
      where,
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            roleScopes: true,
            userScopes: true,
          },
        },
      },
    });

    return c.json({
      scopes: scopesList.map((scope) => ({
        id: scope.id,
        name: scope.name,
        description: scope.description,
        category: scope.category,
        isSystem: scope.isSystem,
        createdAt: scope.createdAt,
        updatedAt: scope.updatedAt,
        usageCount: scope._count.roleScopes + scope._count.userScopes,
      })),
    });
  } catch (error: any) {
    console.error("Error fetching scopes:", error);
    return c.json({ error: "Failed to fetch scopes" }, 500);
  }
});

// Create scope
scopes.post("/:orgId/scopes", authMiddleware, async (c) => {
  try {
    const orgId = c.req.param("orgId");
    const body = await c.req.json();
    const data = createScopeSchema.parse(body);

    // Check if scope name already exists in this org
    const existing = await prisma.scope.findFirst({
      where: {
        organizationId: orgId,
        name: data.name,
      },
    });

    if (existing) {
      return c.json({ error: "Scope with this name already exists" }, 400);
    }

    const scope = await prisma.scope.create({
      data: {
        ...data,
        organizationId: orgId,
      },
    });

    return c.json({ scope }, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation failed", details: error.errors }, 400);
    }
    console.error("Error creating scope:", error);
    return c.json({ error: "Failed to create scope" }, 500);
  }
});

// Get single scope
scopes.get("/:orgId/scopes/:scopeId", authMiddleware, async (c) => {
  try {
    const { orgId, scopeId } = c.req.param();

    const scope = await prisma.scope.findFirst({
      where: {
        id: scopeId,
        organizationId: orgId,
      },
      include: {
        _count: {
          select: {
            roleScopes: true,
            userScopes: true,
          },
        },
        roleScopes: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!scope) {
      return c.json({ error: "Scope not found" }, 404);
    }

    return c.json({
      scope: {
        ...scope,
        usageCount: scope._count.roleScopes + scope._count.userScopes,
      },
    });
  } catch (error: any) {
    console.error("Error fetching scope:", error);
    return c.json({ error: "Failed to fetch scope" }, 500);
  }
});

// Update scope
scopes.put("/:orgId/scopes/:scopeId", authMiddleware, async (c) => {
  try {
    const { orgId, scopeId } = c.req.param();
    const body = await c.req.json();
    const data = updateScopeSchema.parse(body);

    // Check if scope exists and belongs to org
    const existing = await prisma.scope.findFirst({
      where: {
        id: scopeId,
        organizationId: orgId,
      },
    });

    if (!existing) {
      return c.json({ error: "Scope not found" }, 404);
    }

    // Prevent modifying system scopes
    if (existing.isSystem) {
      return c.json({ error: "Cannot modify system scopes" }, 403);
    }

    // If name is being changed, check for duplicates
    if (data.name && data.name !== existing.name) {
      const duplicate = await prisma.scope.findFirst({
        where: {
          organizationId: orgId,
          name: data.name,
          id: { not: scopeId },
        },
      });

      if (duplicate) {
        return c.json({ error: "Scope with this name already exists" }, 400);
      }
    }

    const scope = await prisma.scope.update({
      where: { id: scopeId },
      data,
    });

    return c.json({ scope });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation failed", details: error.errors }, 400);
    }
    console.error("Error updating scope:", error);
    return c.json({ error: "Failed to update scope" }, 500);
  }
});

// Delete scope
scopes.delete("/:orgId/scopes/:scopeId", authMiddleware, async (c) => {
  try {
    const { orgId, scopeId } = c.req.param();

    // Check if scope exists and belongs to org
    const existing = await prisma.scope.findFirst({
      where: {
        id: scopeId,
        organizationId: orgId,
      },
      include: {
        _count: {
          select: {
            roleScopes: true,
            userScopes: true,
          },
        },
      },
    });

    if (!existing) {
      return c.json({ error: "Scope not found" }, 404);
    }

    // Prevent deleting system scopes
    if (existing.isSystem) {
      return c.json({ error: "Cannot delete system scopes" }, 403);
    }

    // Check if scope is in use
    const inUse = existing._count.roleScopes + existing._count.userScopes;
    if (inUse > 0) {
      return c.json(
        {
          error: "Cannot delete scope that is assigned to roles or users",
          usageCount: inUse,
        },
        400
      );
    }

    await prisma.scope.delete({
      where: { id: scopeId },
    });

    return c.json({ message: "Scope deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting scope:", error);
    return c.json({ error: "Failed to delete scope" }, 500);
  }
});

export default scopes;
