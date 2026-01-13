/**
 * Organization Webhooks API
 * Configure and manage webhook endpoints for event notifications
 */

import { Hono } from "hono";
import { db } from "@z0/utils/db/client";
import { verifyAccessTokenMiddleware, type TokenPayload } from "@z0/utils/auth";
import { requireOrgAccess, requireScope } from "../../../middleware/require-scope";
import {
  ErrorResponseBuilder,
  RequestContext,
  Logger,
} from "@z0/utils/error-handling";
import { AuditLogger } from "@z0/utils/audit-logger";
import { z } from "zod";
import { validator } from "hono/validator";
import {
  generateWebhookSecret,
  validateEventTypes,
  sendTestWebhook,
  WEBHOOK_EVENT_LIST,
} from "@z0/utils/webhooks";

const webhooks = new Hono();

const createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  eventTypes: z.array(z.string()).min(1),
  headers: z.record(z.string()).optional(),
  timeout: z.number().int().min(1000).max(30000).optional().default(5000),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional().default(true),
});

const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  eventTypes: z.array(z.string()).min(1).optional(),
  headers: z.record(z.string()).optional().nullable(),
  timeout: z.number().int().min(1000).max(30000).optional(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/v1/orgs/:orgId/webhooks
 * List webhooks for organization
 */
webhooks.get(
  "/:orgId/webhooks",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const orgId = c.req.param("orgId");

    try {
      const webhookList = await db.webhook.findMany({
        where: { organizationId: orgId },
        select: {
          id: true,
          name: true,
          url: true,
          isActive: true,
          eventTypes: true,
          timeout: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { events: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const data = webhookList.map((w) => ({
        ...w,
        eventCount: w._count.events,
        _count: undefined,
      }));

      return c.json({
        success: true,
        data,
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to list webhooks", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to list webhooks", "FETCH_FAILED"),
        500
      );
    }
  }
);

/**
 * GET /api/v1/orgs/:orgId/webhooks/events
 * List available webhook event types
 */
webhooks.get(
  "/:orgId/webhooks/events",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  async (c) => {
    const requestId = RequestContext.generateRequestId();

    return c.json({
      success: true,
      data: WEBHOOK_EVENT_LIST,
      requestId,
    });
  }
);

/**
 * POST /api/v1/orgs/:orgId/webhooks
 * Create webhook
 */
webhooks.post(
  "/:orgId/webhooks",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:settings:write"),
  validator("json", (value, c) => {
    const parsed = createWebhookSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid webhook data",
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
    const requestId = RequestContext.generateRequestId();
    const orgId = c.req.param("orgId");
    const user = c.get("user") as TokenPayload;
    const data = c.req.valid("json");

    try {
      const invalidEvents = validateEventTypes(data.eventTypes);
      if (invalidEvents.length > 0) {
        return c.json(
          ErrorResponseBuilder.validation("Invalid event types", [
            {
              field: "eventTypes",
              message: `Invalid event types: ${invalidEvents.join(", ")}`,
            },
          ]),
          400
        );
      }

      const existing = await db.webhook.findFirst({
        where: {
          organizationId: orgId,
          url: data.url,
        },
      });

      if (existing) {
        return c.json(
          ErrorResponseBuilder.conflict("A webhook with this URL already exists"),
          409
        );
      }

      const secret = generateWebhookSecret();

      const webhook = await db.webhook.create({
        data: {
          organizationId: orgId,
          name: data.name,
          url: data.url,
          secret,
          eventTypes: data.eventTypes,
          headers: data.headers,
          timeout: data.timeout,
          description: data.description,
          isActive: data.isActive,
          createdBy: user.userId,
        },
        select: {
          id: true,
          name: true,
          url: true,
          isActive: true,
          eventTypes: true,
          timeout: true,
          description: true,
          createdAt: true,
        },
      });

      await AuditLogger.logOrganizationManagement(
        "SETTINGS_CHANGED",
        user.userId,
        orgId,
        {
          metadata: {
            action: "webhook_created",
            webhookId: webhook.id,
            webhookName: webhook.name,
            url: webhook.url,
          },
        }
      );

      Logger.info("Webhook created", {
        webhookId: webhook.id,
        orgId,
        url: webhook.url,
        createdBy: user.userId,
        requestId,
      });

      return c.json(
        {
          success: true,
          message: "Webhook created successfully",
          data: {
            ...webhook,
            secret,
          },
          requestId,
        },
        201
      );
    } catch (error: any) {
      Logger.error("Failed to create webhook", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to create webhook", "CREATE_FAILED"),
        500
      );
    }
  }
);

/**
 * GET /api/v1/orgs/:orgId/webhooks/:webhookId
 * Get webhook details
 */
webhooks.get(
  "/:orgId/webhooks/:webhookId",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const orgId = c.req.param("orgId");
    const webhookId = c.req.param("webhookId");

    try {
      const webhook = await db.webhook.findFirst({
        where: {
          id: webhookId,
          organizationId: orgId,
        },
        select: {
          id: true,
          name: true,
          url: true,
          isActive: true,
          eventTypes: true,
          headers: true,
          timeout: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
          _count: {
            select: { events: true },
          },
        },
      });

      if (!webhook) {
        return c.json(
          ErrorResponseBuilder.notFound("Webhook not found"),
          404
        );
      }

      return c.json({
        success: true,
        data: {
          ...webhook,
          eventCount: webhook._count.events,
          _count: undefined,
        },
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to get webhook", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to get webhook", "FETCH_FAILED"),
        500
      );
    }
  }
);

/**
 * PUT /api/v1/orgs/:orgId/webhooks/:webhookId
 * Update webhook
 */
webhooks.put(
  "/:orgId/webhooks/:webhookId",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:settings:write"),
  validator("json", (value, c) => {
    const parsed = updateWebhookSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid webhook data",
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
    const requestId = RequestContext.generateRequestId();
    const orgId = c.req.param("orgId");
    const webhookId = c.req.param("webhookId");
    const user = c.get("user") as TokenPayload;
    const data = c.req.valid("json");

    try {
      const existing = await db.webhook.findFirst({
        where: {
          id: webhookId,
          organizationId: orgId,
        },
      });

      if (!existing) {
        return c.json(
          ErrorResponseBuilder.notFound("Webhook not found"),
          404
        );
      }

      if (data.eventTypes) {
        const invalidEvents = validateEventTypes(data.eventTypes);
        if (invalidEvents.length > 0) {
          return c.json(
            ErrorResponseBuilder.validation("Invalid event types", [
              {
                field: "eventTypes",
                message: `Invalid event types: ${invalidEvents.join(", ")}`,
              },
            ]),
            400
          );
        }
      }

      if (data.url && data.url !== existing.url) {
        const urlExists = await db.webhook.findFirst({
          where: {
            organizationId: orgId,
            url: data.url,
            id: { not: webhookId },
          },
        });

        if (urlExists) {
          return c.json(
            ErrorResponseBuilder.conflict("A webhook with this URL already exists"),
            409
          );
        }
      }

      const webhook = await db.webhook.update({
        where: { id: webhookId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.url !== undefined && { url: data.url }),
          ...(data.eventTypes !== undefined && { eventTypes: data.eventTypes }),
          ...(data.headers !== undefined && { headers: data.headers }),
          ...(data.timeout !== undefined && { timeout: data.timeout }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
        select: {
          id: true,
          name: true,
          url: true,
          isActive: true,
          eventTypes: true,
          timeout: true,
          description: true,
          updatedAt: true,
        },
      });

      await AuditLogger.logOrganizationManagement(
        "SETTINGS_CHANGED",
        user.userId,
        orgId,
        {
          metadata: {
            action: "webhook_updated",
            webhookId,
            webhookName: webhook.name,
          },
        }
      );

      Logger.info("Webhook updated", {
        webhookId,
        orgId,
        updatedBy: user.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: "Webhook updated successfully",
        data: webhook,
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to update webhook", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to update webhook", "UPDATE_FAILED"),
        500
      );
    }
  }
);

/**
 * DELETE /api/v1/orgs/:orgId/webhooks/:webhookId
 * Delete webhook
 */
webhooks.delete(
  "/:orgId/webhooks/:webhookId",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:settings:delete"),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const orgId = c.req.param("orgId");
    const webhookId = c.req.param("webhookId");
    const user = c.get("user") as TokenPayload;

    try {
      const existing = await db.webhook.findFirst({
        where: {
          id: webhookId,
          organizationId: orgId,
        },
      });

      if (!existing) {
        return c.json(
          ErrorResponseBuilder.notFound("Webhook not found"),
          404
        );
      }

      await db.webhook.delete({
        where: { id: webhookId },
      });

      await AuditLogger.logOrganizationManagement(
        "SETTINGS_CHANGED",
        user.userId,
        orgId,
        {
          metadata: {
            action: "webhook_deleted",
            webhookId,
            webhookName: existing.name,
            url: existing.url,
          },
        }
      );

      Logger.info("Webhook deleted", {
        webhookId,
        orgId,
        deletedBy: user.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: "Webhook deleted successfully",
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to delete webhook", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to delete webhook", "DELETE_FAILED"),
        500
      );
    }
  }
);

/**
 * GET /api/v1/orgs/:orgId/webhooks/:webhookId/events
 * List webhook delivery events
 */
webhooks.get(
  "/:orgId/webhooks/:webhookId/events",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const orgId = c.req.param("orgId");
    const webhookId = c.req.param("webhookId");
    const page = parseInt(c.req.query("page") || "1");
    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100);
    const status = c.req.query("status");

    try {
      const webhook = await db.webhook.findFirst({
        where: {
          id: webhookId,
          organizationId: orgId,
        },
      });

      if (!webhook) {
        return c.json(
          ErrorResponseBuilder.notFound("Webhook not found"),
          404
        );
      }

      const where: any = { webhookId };
      if (status) {
        where.status = status;
      }

      const [events, total] = await Promise.all([
        db.webhookEvent.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            eventType: true,
            status: true,
            statusCode: true,
            errorMessage: true,
            deliveredAt: true,
            durationMs: true,
            createdAt: true,
          },
        }),
        db.webhookEvent.count({ where }),
      ]);

      return c.json({
        success: true,
        data: events,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to list webhook events", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to list webhook events", "FETCH_FAILED"),
        500
      );
    }
  }
);

/**
 * POST /api/v1/orgs/:orgId/webhooks/:webhookId/test
 * Send test webhook
 */
webhooks.post(
  "/:orgId/webhooks/:webhookId/test",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:settings:write"),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const orgId = c.req.param("orgId");
    const webhookId = c.req.param("webhookId");
    const user = c.get("user") as TokenPayload;

    try {
      const webhook = await db.webhook.findFirst({
        where: {
          id: webhookId,
          organizationId: orgId,
        },
      });

      if (!webhook) {
        return c.json(
          ErrorResponseBuilder.notFound("Webhook not found"),
          404
        );
      }

      const result = await sendTestWebhook(webhookId);

      Logger.info("Test webhook sent", {
        webhookId,
        orgId,
        success: result.success,
        statusCode: result.statusCode,
        durationMs: result.durationMs,
        sentBy: user.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: result.success
          ? "Test webhook delivered successfully"
          : "Test webhook delivery failed",
        data: {
          delivered: result.success,
          statusCode: result.statusCode,
          errorMessage: result.errorMessage,
          durationMs: result.durationMs,
        },
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to send test webhook", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to send test webhook", "TEST_FAILED"),
        500
      );
    }
  }
);

/**
 * POST /api/v1/orgs/:orgId/webhooks/:webhookId/regenerate-secret
 * Regenerate webhook secret
 */
webhooks.post(
  "/:orgId/webhooks/:webhookId/regenerate-secret",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:settings:write"),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const orgId = c.req.param("orgId");
    const webhookId = c.req.param("webhookId");
    const user = c.get("user") as TokenPayload;

    try {
      const existing = await db.webhook.findFirst({
        where: {
          id: webhookId,
          organizationId: orgId,
        },
      });

      if (!existing) {
        return c.json(
          ErrorResponseBuilder.notFound("Webhook not found"),
          404
        );
      }

      const newSecret = generateWebhookSecret();

      await db.webhook.update({
        where: { id: webhookId },
        data: { secret: newSecret },
      });

      await AuditLogger.logOrganizationManagement(
        "SETTINGS_CHANGED",
        user.userId,
        orgId,
        {
          metadata: {
            action: "webhook_secret_regenerated",
            webhookId,
            webhookName: existing.name,
          },
        }
      );

      Logger.info("Webhook secret regenerated", {
        webhookId,
        orgId,
        regeneratedBy: user.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: "Webhook secret regenerated successfully. Update your endpoint with the new secret.",
        data: {
          secret: newSecret,
        },
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to regenerate webhook secret", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to regenerate webhook secret", "REGENERATE_FAILED"),
        500
      );
    }
  }
);

export default webhooks;
