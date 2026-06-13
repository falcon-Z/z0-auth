import type { DeployStatusResponse } from "@z0/contracts/deploy-status";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { loadDeployStatus } from "../lib/deploy";
import { DeploySetupPage } from "../modules/deploy/DeploySetupPage";
import { SessionGate } from "../components/shell/SessionGate";

type DeployContextValue = {
  status: DeployStatusResponse;
  refresh: () => Promise<void>;
};

const DeployContext = createContext<DeployContextValue | null>(null);

function SetupRedirect() {
  useEffect(() => {
    window.location.href = "/auth/setup";
  }, []);
  return <SessionGate message="Redirecting to platform setup…" />;
}

export function DeployProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DeployStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const next = await loadDeployStatus();
      setStatus(next);
    } catch {
      setError("Could not reach the server. Check that the app is running, then refresh.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!status || status.ready) return;
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [status?.ready, refresh]);

  if (error) {
    return (
      <SessionGate
        message={error}
      />
    );
  }

  if (!status) {
    return <SessionGate />;
  }

  if (!status.ready) {
    return <DeploySetupPage status={status} onRefresh={() => void refresh()} refreshing={refreshing} />;
  }

  if (!status.platform?.setupComplete) {
    return <SetupRedirect />;
  }

  return (
    <DeployContext.Provider value={{ status, refresh }}>
      {children}
    </DeployContext.Provider>
  );
}

export function useDeployStatus(): DeployContextValue {
  const ctx = useContext(DeployContext);
  if (!ctx) throw new Error("useDeployStatus must be used within DeployProvider after deploy is ready");
  return ctx;
}
