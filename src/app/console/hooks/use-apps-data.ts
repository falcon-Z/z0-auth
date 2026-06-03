import { useCallback, useEffect, useState } from "react";

import type { AppSummary } from "@z0/contracts/apps";

import { fetchApps } from "../lib/apps-api";
import { ApiError } from "../lib/api";

export function useAppsData() {
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApps(await fetchApps());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load applications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { apps, loading, error, reload };
}
