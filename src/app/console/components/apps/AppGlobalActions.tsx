import { useState } from "react";

import { Button } from "@z0/components/ui/button";
import { useConfirm } from "../feedback/ConfirmDialog";
import { useAppWorkspace } from "../../context/app-workspace-context";
import { ApiError } from "../../lib/api";
import { patchApp } from "../../lib/apps-api";
import { AppFormDialog } from "../../modules/apps/components/AppFormDialog";

export function AppGlobalActions() {
  const { appId, app, setApp, setNotice } = useAppWorkspace();
  const confirm = useConfirm();
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggleDisabled() {
    const disabling = app.status === "active";
    const ok = await confirm({
      title: disabling ? "Disable app" : "Enable app",
      description: disabling
        ? "New authorization and token issuance stop for every child client."
        : "The app will be active again.",
      confirmLabel: disabling ? "Disable" : "Enable",
      destructive: disabling,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const updated = await patchApp(appId, { status: disabling ? "disabled" : "active" });
      setApp(updated);
      setNotice(disabling ? "App disabled." : "App enabled.");
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not update app.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" disabled={app.status === "pending_deletion"} onClick={() => setEditOpen(true)}>
        Edit
      </Button>
      <Button variant="outline" disabled={busy || app.status === "pending_deletion"} onClick={() => void toggleDisabled()}>
        {app.status === "active" ? "Disable" : "Enable"}
      </Button>

      <AppFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initial={{ name: app.name, minimumAssurance: app.minimumAssurance }}
        onSubmit={(body) => patchApp(appId, body)}
        onSuccess={(updated) => {
          setApp(updated);
          setNotice("App updated.");
        }}
      />
    </>
  );
}
