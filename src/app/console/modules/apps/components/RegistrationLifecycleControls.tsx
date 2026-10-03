import { useState } from "react";
import type { AppDetail, OAuthClientSummary, RegistrationLifecycleAction } from "@z0/contracts/apps";
import { Button } from "@z0/components/ui/button";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { changeRegistrationLifecycle } from "../../../lib/apps-api";

export function RegistrationLifecycleControls({ appId, client, app, graceDays, disabled, onChanged, onError }: {
  appId: string;
  client?: OAuthClientSummary;
  app: AppDetail;
  graceDays: number;
  disabled?: boolean;
  onChanged: (registration: AppDetail | OAuthClientSummary | null) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const target = client ?? app;
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const pending = target.status === "pending_deletion";
  const expired = Boolean(target.purgeAfter && new Date(target.purgeAfter).getTime() <= Date.now());
  const identifier = client ? client.clientId : appId;
  const kind = client ? "client" : "application";
  async function change(action: RegistrationLifecycleAction) {
    const irreversible = action === "purge" || (action === "delete" && graceDays === 0);
    const confirmed = await confirm({
      title: action === "restore" ? `Restore ${kind}` : irreversible ? `Permanently delete ${kind}` : `Delete ${kind}`,
      description: action === "restore"
        ? "Future use will be allowed. Revoked authorization codes and refresh tokens will stay revoked."
        : irreversible
          ? `This permanently removes the ${kind} configuration${client ? "" : ", its child clients and application identity relationships"}. The Client IDs can never be reused. You must verify again to continue.`
          : `This stops new authorization and token issuance${client ? " for this client" : " for all child clients"}. You can restore within ${graceDays} days. You must verify again to continue.`,
      confirmationText: action === "restore" ? undefined : identifier,
      confirmationLabel: `Type the ${client ? "Client" : "Application"} ID to confirm: ${identifier}`,
      confirmLabel: action === "restore" ? "Restore" : irreversible ? "Delete permanently" : "Delete",
      destructive: action !== "restore",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      const result = await changeRegistrationLifecycle(appId, { action, confirmation: action === "restore" ? undefined : identifier, expectedGraceDays: action === "delete" ? graceDays : undefined }, client?.id);
      await onChanged(result.registration);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not change deletion state.");
    } finally { setBusy(false); }
  }
  return <div className="space-y-3 border-t pt-4">
    <h3 className="text-sm font-medium">{client ? client.label : "Application"} deletion</h3>
    {pending ? <>
      <p className="text-sm">Pending Deletion. Recovery deadline: <time dateTime={target.purgeAfter!}>{new Date(target.purgeAfter!).toLocaleString()}</time>. Configuration is contained until restored; after this deadline it is permanently purged.</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={busy || disabled || expired || Boolean(client && app.status !== "active")} onClick={() => void change("restore")}>Restore {kind}</Button>
        <Button type="button" variant="outline" disabled={busy || disabled} onClick={() => void change("purge")}>Delete permanently</Button>
      </div>
    </> : <>
      <p className="text-sm text-muted-foreground">{graceDays === 0 ? "Recovery is disabled. Deleting permanently purges this registration immediately." : `Deletion can be cancelled for ${graceDays} days. Renewable token state stays revoked after restoration.`}</p>
      <Button type="button" variant="outline" disabled={busy || disabled} onClick={() => void change("delete")}>Delete {kind}</Button>
    </>}
  </div>;
}
