/**
 * WebhookTable component
 * DataTable wrapper for webhooks with built-in actions
 */

import { useMemo } from "react";
import { DataTable } from "@z0/app/components/data-table/data-table";
import { getWebhookColumns, type Webhook } from "./webhook-columns";

interface WebhookTableProps {
  /** Webhooks data */
  data: Webhook[];
  /** Loading state */
  loading?: boolean;
  /** Edit webhook handler */
  onEdit?: (webhook: Webhook) => void;
  /** Delete webhook handler */
  onDelete?: (webhook: Webhook) => void;
  /** Toggle status handler */
  onToggleStatus?: (webhook: Webhook) => void;
  /** Test webhook handler */
  onTest?: (webhook: Webhook) => void;
  /** Row click handler */
  onRowClick?: (webhook: Webhook) => void;
  /** Show action column */
  showActions?: boolean;
  /** Empty state message */
  emptyMessage?: string;
}

export function WebhookTable({
  data,
  loading = false,
  onEdit,
  onDelete,
  onToggleStatus,
  onTest,
  onRowClick,
  showActions = true,
  emptyMessage = "No webhooks configured.",
}: WebhookTableProps) {
  const columns = useMemo(
    () =>
      getWebhookColumns({
        onEdit,
        onDelete,
        onToggleStatus,
        onTest,
        showActions,
      }),
    [onEdit, onDelete, onToggleStatus, onTest, showActions]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      loading={loading}
      onRowClick={onRowClick}
      emptyState={
        <div className="text-center py-8 text-muted-foreground">
          {emptyMessage}
        </div>
      }
    />
  );
}

export type { WebhookTableProps };
