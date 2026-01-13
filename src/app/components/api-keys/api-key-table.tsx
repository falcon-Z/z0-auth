/**
 * ApiKeyTable component
 * DataTable wrapper for API keys with built-in actions
 */

import { useMemo } from "react";
import { DataTable } from "@z0/app/components/data-table/data-table";
import { getApiKeyColumns, type ApiKey } from "./api-key-columns";

interface ApiKeyTableProps {
  /** API keys data */
  data: ApiKey[];
  /** Loading state */
  loading?: boolean;
  /** Revoke key handler */
  onRevoke?: (apiKey: ApiKey) => void;
  /** Copy key handler */
  onCopyKey?: (apiKey: ApiKey) => void;
  /** Show action column */
  showActions?: boolean;
  /** Empty state message */
  emptyMessage?: string;
}

export function ApiKeyTable({
  data,
  loading = false,
  onRevoke,
  onCopyKey,
  showActions = true,
  emptyMessage = "No API keys found.",
}: ApiKeyTableProps) {
  const columns = useMemo(
    () =>
      getApiKeyColumns({
        onRevoke,
        onCopyKey,
        showActions,
      }),
    [onRevoke, onCopyKey, showActions]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      loading={loading}
      emptyState={
        <div className="text-center py-8 text-muted-foreground">
          {emptyMessage}
        </div>
      }
    />
  );
}

export type { ApiKeyTableProps };
