/**
 * Webhook Dispatcher
 * Synchronous webhook delivery with signature and logging
 */

import { db } from "@z0/utils/db/client";
import { Logger } from "@z0/utils/error-handling";
import { generateSignature, buildSignatureHeader } from "./signature";
import type { WebhookPayload, WebhookEventType } from "./events";
import { WEBHOOK_EVENT_LIST } from "./events";

interface WebhookDeliveryResult {
  webhookId: string;
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  errorMessage?: string;
  durationMs: number;
}

interface DispatchOptions {
  organizationId?: string;
  appId?: string;
  eventType: WebhookEventType;
  data: Record<string, unknown>;
  metadata?: WebhookPayload["metadata"];
}

/**
 * Dispatch webhook to all configured endpoints for the event type
 * Supports hierarchical webhook scopes:
 * - PLATFORM webhooks receive ALL events
 * - ORGANIZATION webhooks receive events for that org and its apps
 * - APP webhooks receive events for that specific app only
 *
 * Synchronous delivery - blocks until all webhooks are delivered
 */
export async function dispatchWebhook(
  options: DispatchOptions
): Promise<WebhookDeliveryResult[]> {
  const { organizationId, appId, eventType, data, metadata } = options;

  // Find all applicable webhooks based on scope hierarchy
  const webhooks = await db.webhook.findMany({
    where: {
      isActive: true,
      eventTypes: { has: eventType },
      OR: [
        // Platform webhooks receive ALL events
        { scope: "PLATFORM" },
        // Organization webhooks receive events for their org and its apps
        ...(organizationId
          ? [{ scope: "ORGANIZATION" as const, organizationId }]
          : []),
        // App webhooks receive only their app's events
        ...(appId ? [{ scope: "APP" as const, appId }] : []),
      ],
    },
  });

  if (webhooks.length === 0) {
    return [];
  }

  const timestamp = new Date().toISOString();
  const payload: WebhookPayload = {
    event: eventType,
    timestamp,
    organizationId,
    appId,
    data,
    metadata,
  };

  const results: WebhookDeliveryResult[] = [];

  for (const webhook of webhooks) {
    const result = await deliverWebhook(webhook, payload);
    results.push(result);

    await db.webhookEvent.create({
      data: {
        webhookId: webhook.id,
        eventType,
        payload: payload as any,
        status: result.success ? "delivered" : "failed",
        statusCode: result.statusCode,
        responseBody: result.responseBody?.substring(0, 1000),
        errorMessage: result.errorMessage,
        deliveredAt: result.success ? new Date() : null,
        durationMs: result.durationMs,
      },
    });
  }

  return results;
}

async function deliverWebhook(
  webhook: { id: string; url: string; secret: string; headers: any; timeout: number },
  payload: WebhookPayload
): Promise<WebhookDeliveryResult> {
  const startTime = Date.now();
  const payloadString = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payloadString}`;
  const signature = generateSignature(signedPayload, webhook.secret);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Webhook-Signature": buildSignatureHeader(timestamp, signature),
    "X-Webhook-Timestamp": timestamp.toString(),
    "X-Webhook-Event": payload.event,
    "User-Agent": "Z0Auth-Webhook/1.0",
  };

  if (webhook.headers && typeof webhook.headers === "object") {
    Object.assign(headers, webhook.headers);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), webhook.timeout);

    const response = await fetch(webhook.url, {
      method: "POST",
      headers,
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const durationMs = Date.now() - startTime;
    let responseBody: string | undefined;

    try {
      responseBody = await response.text();
    } catch {
      responseBody = undefined;
    }

    const success = response.status >= 200 && response.status < 300;

    if (!success) {
      Logger.warn("Webhook delivery failed", {
        webhookId: webhook.id,
        url: webhook.url,
        statusCode: response.status,
        event: payload.event,
        durationMs,
      });
    } else {
      Logger.info("Webhook delivered successfully", {
        webhookId: webhook.id,
        url: webhook.url,
        statusCode: response.status,
        event: payload.event,
        durationMs,
      });
    }

    return {
      webhookId: webhook.id,
      success,
      statusCode: response.status,
      responseBody,
      durationMs,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error.name === "AbortError"
      ? `Request timeout after ${webhook.timeout}ms`
      : error.message || "Unknown error";

    Logger.error("Webhook delivery error", {
      webhookId: webhook.id,
      url: webhook.url,
      error: errorMessage,
      event: payload.event,
      durationMs,
    });

    return {
      webhookId: webhook.id,
      success: false,
      errorMessage,
      durationMs,
    };
  }
}

/**
 * Send a test event to a specific webhook
 */
export async function sendTestWebhook(
  webhookId: string
): Promise<WebhookDeliveryResult> {
  const webhook = await db.webhook.findUnique({
    where: { id: webhookId },
  });

  if (!webhook) {
    return {
      webhookId,
      success: false,
      errorMessage: "Webhook not found",
      durationMs: 0,
    };
  }

  const testPayload: WebhookPayload = {
    event: "settings.changed" as WebhookEventType,
    timestamp: new Date().toISOString(),
    organizationId: webhook.organizationId || undefined,
    appId: webhook.appId || undefined,
    data: {
      test: true,
      message: "This is a test webhook event",
    },
    metadata: {
      requestId: `test_${Date.now()}`,
    },
  };

  const result = await deliverWebhook(webhook, testPayload);

  await db.webhookEvent.create({
    data: {
      webhookId: webhook.id,
      eventType: "test",
      payload: testPayload as any,
      status: result.success ? "delivered" : "failed",
      statusCode: result.statusCode,
      responseBody: result.responseBody?.substring(0, 1000),
      errorMessage: result.errorMessage,
      deliveredAt: result.success ? new Date() : null,
      durationMs: result.durationMs,
    },
  });

  return result;
}

/**
 * Validate webhook event types
 */
export function validateEventTypes(eventTypes: string[]): string[] {
  const invalid = eventTypes.filter((e) => !WEBHOOK_EVENT_LIST.includes(e as any));
  return invalid;
}
