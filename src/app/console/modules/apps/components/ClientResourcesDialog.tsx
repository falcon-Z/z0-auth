import { useEffect, useState } from "react";
import type { OAuthClientSummary } from "@z0/contracts/apps";
import type {
  ResourceSummary,
  ClientResourcePermission,
} from "@z0/contracts/resources";
import { Button } from "@z0/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@z0/components/ui/dialog";
import {
  fetchResources,
  fetchClientResources,
  putClientResource,
  removeClientResource,
} from "../../../lib/resources-api";

export function ClientResourcesDialog({
  appId,
  client,
  onClose,
}: {
  appId: string;
  client: OAuthClientSummary;
  onClose: () => void;
}) {
  const [resources, setResources] = useState<ResourceSummary[]>([]),
    [permissions, setPermissions] = useState<ClientResourcePermission[]>([]);
  const [selected, setSelected] = useState(""),
    [scopes, setScopes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([fetchResources(), fetchClientResources(appId, client.id)])
      .then(([r, p]) => {
        if (active) {
          setResources(r);
          setPermissions(p);
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Could not load resources.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appId, client.id]);
  function select(id: string) {
    setSelected(id);
    setScopes(permissions.find((p) => p.resourceId === id)?.scopes ?? []);
    setError(null);
  }
  async function save(remove = false) {
    setBusy(true);
    setError(null);
    try {
      if (remove) await removeClientResource(appId, client.id, selected);
      else await putClientResource(appId, client.id, selected, scopes);
      const p = await fetchClientResources(appId, client.id);
      setPermissions(p);
      setScopes(p.find((p) => p.resourceId === selected)?.scopes ?? []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save resource permissions.",
      );
    } finally {
      setBusy(false);
    }
  }
  const resource = resources.find((r) => r.id === selected);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resource access for {client.label}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Choose the APIs and maximum scopes this client may request. New
          clients start with no resource authority.
        </p>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <>
            <ul className="text-sm">
              {permissions.map((p) => (
                <li key={p.resourceId}>
                  {p.name}: {p.scopes.join(", ") || "No scopes"}
                </li>
              ))}
            </ul>
            <div className="text-sm">
              <label htmlFor="client-resource" className="block">
                Resource
              </label>
              <select
                id="client-resource"
                className="mt-1 w-full rounded border p-2"
                value={selected}
                onChange={(e) => select(e.target.value)}
                disabled={busy}
              >
                <option value="">Select a registered API</option>
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.audience}
                  </option>
                ))}
                {permissions
                  .filter((p) => !resources.some((r) => r.id === p.resourceId))
                  .map((p) => (
                    <option key={p.resourceId} value={p.resourceId}>
                      {p.name} — {p.audience} (unavailable)
                    </option>
                  ))}
              </select>
            </div>
            {resource && (
              <fieldset disabled={busy}>
                <legend className="mb-2 text-sm">Allowed scopes</legend>
                {resource.scopes.map((scope) => (
                  <label
                    key={scope}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope)}
                      onChange={(e) =>
                        setScopes(
                          e.target.checked
                            ? [...scopes, scope]
                            : scopes.filter((s) => s !== scope),
                        )
                      }
                    />
                    {scope}
                  </label>
                ))}
              </fieldset>
            )}
            <p className="text-xs text-muted-foreground">
              Reducing scopes contracts existing grants permanently. Removing
              access revokes this client's grants for this resource.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          {permissions.some((p) => p.resourceId === selected) && (
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void save(true)}
            >
              Remove access
            </Button>
          )}
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Done
          </Button>
          <Button
            disabled={busy || !resource || loading}
            onClick={() => void save()}
          >
            Save access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
