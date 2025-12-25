/**
 * Webhook Event Types
 * Defines all event types that can trigger webhook notifications
 */

export const WEBHOOK_EVENTS = {
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_DELETED: "user.deleted",
  USER_LOGIN: "user.login",
  USER_LOGOUT: "user.logout",
  USER_PASSWORD_CHANGED: "user.password_changed",
  USER_EMAIL_VERIFIED: "user.email_verified",
  USER_2FA_ENABLED: "user.2fa_enabled",
  USER_2FA_DISABLED: "user.2fa_disabled",
  MEMBER_ADDED: "member.added",
  MEMBER_REMOVED: "member.removed",
  MEMBER_ROLE_CHANGED: "member.role_changed",
  APP_CREATED: "app.created",
  APP_UPDATED: "app.updated",
  APP_DELETED: "app.deleted",
  APP_MEMBER_ADDED: "app.member_added",
  APP_MEMBER_REMOVED: "app.member_removed",
  SESSION_CREATED: "session.created",
  SESSION_REVOKED: "session.revoked",
  SESSION_EXPIRED: "session.expired",
  SECURITY_LOCKOUT: "security.lockout",
  SECURITY_LOCKOUT_CLEARED: "security.lockout_cleared",
  API_KEY_CREATED: "api_key.created",
  API_KEY_REVOKED: "api_key.revoked",
  API_KEY_ROTATED: "api_key.rotated",
  SETTINGS_CHANGED: "settings.changed",
} as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[keyof typeof WEBHOOK_EVENTS];

export const WEBHOOK_EVENT_LIST = Object.values(WEBHOOK_EVENTS);

export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  organizationId: string;
  data: Record<string, unknown>;
  metadata?: {
    userId?: string;
    appId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  };
}

export function isValidEventType(eventType: string): eventType is WebhookEventType {
  return WEBHOOK_EVENT_LIST.includes(eventType as WebhookEventType);
}

export function getEventCategory(eventType: WebhookEventType): string {
  const [category] = eventType.split(".");
  return category;
}
