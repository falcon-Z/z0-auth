import { useEffect } from "react";

import { useBreadcrumbContext } from "../context/breadcrumb-context";
import type { BreadcrumbSegment } from "../lib/breadcrumbs";

export function usePageBreadcrumbs(trail: BreadcrumbSegment[] | null, deps: unknown[]) {
  const { setOverride } = useBreadcrumbContext();

  useEffect(() => {
    setOverride(trail);
    return () => setOverride(null);
    // Trail content is driven by explicit deps from the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
