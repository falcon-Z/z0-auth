import type { ConsoleSummaryResponse } from "@z0/contracts/console-summary";

import { apiFetch } from "./api";

export async function fetchConsoleSummary(): Promise<ConsoleSummaryResponse> {
  return apiFetch<ConsoleSummaryResponse>("/api/v1/console/summary");
}
