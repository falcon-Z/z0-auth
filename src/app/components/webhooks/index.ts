/**
 * Webhooks components barrel export
 *
 * Usage:
 * import {
 *   WebhookTable,
 *   CreateWebhookDialog,
 *   EditWebhookDialog,
 *   DeleteWebhookDialog,
 *   TestWebhookDialog,
 * } from "@z0/app/components/webhooks";
 */

// Tables
export { WebhookTable } from "./webhook-table";
export type { WebhookTableProps } from "./webhook-table";

// Column definitions
export { getWebhookColumns } from "./webhook-columns";
export type { WebhookColumnsOptions, Webhook } from "./webhook-columns";

// Dialogs
export {
  CreateWebhookDialog,
  EditWebhookDialog,
  DeleteWebhookDialog,
  TestWebhookDialog,
} from "./webhook-dialogs";
export type {
  CreateWebhookDialogProps,
  EditWebhookDialogProps,
  DeleteWebhookDialogProps,
  TestWebhookDialogProps,
  WebhookInput,
} from "./webhook-dialogs";
