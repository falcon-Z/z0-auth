import { useCallback, useEffect, useState } from "react";

import { fetchConsoleSummary } from "../../../lib/console-summary-api";
import { ApiError } from "../../../lib/api";
import { useSession } from "../../../context/session-context";
import type { ConsoleSummaryResponse } from "@z0/contracts/console-summary";
import { HomeView } from "../components/HomeView";

export function HomePage() {
  const { session } = useSession();
  const [summary, setSummary] = useState<ConsoleSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await fetchConsoleSummary());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load home.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <HomeView
      session={session}
      summary={summary}
      loading={loading}
      error={error}
      onRetry={() => void reload()}
    />
  );
}
