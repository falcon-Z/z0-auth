import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useParams } from "react-router-dom";

import type { AppDetail } from "@z0/contracts/apps";
import { Button } from "@z0/components/ui/button";
import { AppWorkspaceProvider } from "../../context/app-workspace-context";
import { EntityDetailLayout } from "../layout/EntityDetailLayout";
import { ListPageSkeleton } from "../feedback/ListPageSkeleton";
import { PageError } from "../feedback/PageError";
import { ApiError } from "../../lib/api";
import { fetchApp } from "../../lib/apps-api";
import { AppGlobalActions } from "./AppGlobalActions";
import { AppWorkspaceLayout } from "./AppWorkspaceLayout";

export function AppWorkspaceRoute() {
  const { appId } = useParams<{ appId: string }>();
  const [app, setApp] = useState<AppDetail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchGenerationRef = useRef(0);

  const loadApp = useCallback(async (targetAppId: string) => {
    const generation = ++fetchGenerationRef.current;
    setLoading(true);
    setError(null);
    setApp(null);

    try {
      const next = await fetchApp(targetAppId);
      if (generation !== fetchGenerationRef.current) return;
      setApp(next);
    } catch (e) {
      if (generation !== fetchGenerationRef.current) return;
      setError(e instanceof ApiError ? e.message : "Could not load app.");
    } finally {
      if (generation === fetchGenerationRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setNotice(null);

    if (!appId) {
      setLoading(false);
      setApp(null);
      setError("App not found.");
      return;
    }

    void loadApp(appId);

    return () => {
      fetchGenerationRef.current += 1;
    };
  }, [appId, loadApp]);

  const refreshApp = useCallback(async () => {
    if (!appId) return;
    await loadApp(appId);
  }, [appId, loadApp]);

  if (loading) return <ListPageSkeleton />;

  if (error || !app || !appId || app.id !== appId) {
    return (
      <EntityDetailLayout name="App">
        <PageError title="Not found" message={error ?? "App not found."} onRetry={() => void refreshApp()}>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/apps">Back to apps</Link>
          </Button>
        </PageError>
      </EntityDetailLayout>
    );
  }

  return (
    <AppWorkspaceProvider
      value={{
        appId,
        app,
        setApp,
        notice,
        setNotice,
        refreshApp,
      }}
    >
      <AppWorkspaceLayout appId={appId} app={app} notice={notice} actions={<AppGlobalActions />}>
        <Outlet />
      </AppWorkspaceLayout>
    </AppWorkspaceProvider>
  );
}
