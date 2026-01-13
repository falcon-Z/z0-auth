/**
 * Application type definitions
 * Single source of truth for all application-related types
 */

import type { AppStatus } from "./roles";

/**
 * Base application properties
 */
export interface AppBase {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: AppStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Application with member count (for list views)
 */
export interface AppWithCounts extends AppBase {
  memberCount: number;
}

/**
 * Application list item (includes API key for owner display)
 */
export interface AppListItem extends AppWithCounts {
  apiKey?: string;
}

/**
 * Application details for detail views
 */
export interface AppDetail extends AppBase {
  organizationId: string;
  allowedOrigins: string[];
  memberCount: number;
  apiKeys?: AppApiKey[];
  webhooks?: AppWebhook[];
}

/**
 * Application API key
 */
export interface AppApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

/**
 * Application webhook (simplified)
 */
export interface AppWebhook {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

// Input types for application operations

export interface CreateAppInput {
  name: string;
  slug: string;
  description?: string;
  allowedOrigins?: string[];
}

export interface UpdateAppInput {
  name?: string;
  slug?: string;
  description?: string;
  allowedOrigins?: string[];
  status?: AppStatus;
}

/**
 * Response when creating an app (includes secret)
 */
export interface CreateAppResponse {
  app: AppListItem;
  apiKey: string;
  apiSecret: string;
}
