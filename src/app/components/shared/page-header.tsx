/**
 * PageHeader component
 * Standard page header with title, description, and action buttons
 */

import { ReactNode } from "react";
import { Button } from "@z0/components/ui/button";
import { RefreshCw, Plus } from "lucide-react";

interface PageHeaderProps {
  /** Page title */
  title: string;
  /** Optional description text */
  description?: string;
  /** Optional action buttons or custom content */
  actions?: ReactNode;
  /** Show refresh button */
  showRefresh?: boolean;
  /** Refresh button handler */
  onRefresh?: () => void;
  /** Is refreshing */
  isRefreshing?: boolean;
  /** Show create button */
  showCreate?: boolean;
  /** Create button label (default: "Create") */
  createLabel?: string;
  /** Create button handler */
  onCreate?: () => void;
}

export function PageHeader({
  title,
  description,
  actions,
  showRefresh = false,
  onRefresh,
  isRefreshing = false,
  showCreate = false,
  createLabel = "Create",
  onCreate,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground sm:text-base">
            {description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {showRefresh && onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        )}

        {showCreate && onCreate && (
          <Button size="sm" onClick={onCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {createLabel}
          </Button>
        )}

        {actions}
      </div>
    </div>
  );
}

export type { PageHeaderProps };
