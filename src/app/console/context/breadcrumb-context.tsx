import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { BreadcrumbSegment } from "../lib/breadcrumbs";

type BreadcrumbContextValue = {
  override: BreadcrumbSegment[] | null;
  setOverride: (trail: BreadcrumbSegment[] | null) => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<BreadcrumbSegment[] | null>(null);
  const setOverride = useCallback((trail: BreadcrumbSegment[] | null) => {
    setOverrideState(trail);
  }, []);

  const value = useMemo(
    () => ({
      override,
      setOverride,
    }),
    [override, setOverride],
  );

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumbContext() {
  const ctx = useContext(BreadcrumbContext);
  if (!ctx) {
    throw new Error("useBreadcrumbContext must be used within BreadcrumbProvider");
  }
  return ctx;
}
