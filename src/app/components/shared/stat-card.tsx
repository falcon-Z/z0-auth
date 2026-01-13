/**
 * StatCard Component
 *
 * Reusable card for displaying statistics on dashboards.
 * Shows a metric value with optional icon, trend indicator, and description.
 */

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@z0/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

export interface StatCardProps {
  title: string;
  value: number | string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    direction: "up" | "down";
  };
  description?: string;
  loading?: boolean;
}

export function StatCard({
  title,
  value,
  icon,
  trend,
  description,
  loading = false,
}: StatCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {icon}
        </CardHeader>
        <CardContent>
          <div className="h-7 w-20 animate-pulse bg-gray-200 rounded" />
          {description && (
            <div className="h-3 w-32 mt-1 animate-pulse bg-gray-200 rounded" />
          )}
        </CardContent>
      </Card>
    );
  }

  const formatValue = (val: number | string): string => {
    if (typeof val === "number") {
      // Format large numbers with commas
      return val.toLocaleString();
    }
    return val;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatValue(value)}</div>
        {trend && (
          <div className="flex items-center text-xs mt-1">
            {trend.direction === "up" ? (
              <TrendingUp className="h-3 w-3 mr-1 text-green-600" />
            ) : (
              <TrendingDown className="h-3 w-3 mr-1 text-red-600" />
            )}
            <span
              className={
                trend.direction === "up" ? "text-green-600" : "text-red-600"
              }
            >
              {trend.value > 0 ? "+" : ""}
              {trend.value}%
            </span>
            <span className="text-muted-foreground ml-1">from last period</span>
          </div>
        )}
        {description && !trend && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
