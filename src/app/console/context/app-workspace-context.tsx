import { createContext, useContext, type ReactNode } from "react";

import type { AppDetail } from "@z0/contracts/apps";

type AppWorkspaceContextValue = {
  appId: string;
  app: AppDetail;
  setApp: (app: AppDetail) => void;
  notice: string | null;
  setNotice: (message: string | null) => void;
  refreshApp: () => Promise<void>;
};

const AppWorkspaceContext = createContext<AppWorkspaceContextValue | null>(null);

type AppWorkspaceProviderProps = {
  value: AppWorkspaceContextValue;
  children: ReactNode;
};

export function AppWorkspaceProvider({ value, children }: AppWorkspaceProviderProps) {
  return <AppWorkspaceContext.Provider value={value}>{children}</AppWorkspaceContext.Provider>;
}

export function useAppWorkspace(): AppWorkspaceContextValue {
  const value = useContext(AppWorkspaceContext);
  if (!value) {
    throw new Error("useAppWorkspace must be used within AppWorkspaceRoute.");
  }
  return value;
}
