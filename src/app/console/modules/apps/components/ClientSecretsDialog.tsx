import { useCallback, useEffect, useState } from "react";
import type { AppDetail, ClientSecretSummary, OAuthClientSummary } from "@z0/contracts/apps";
import { Button } from "@z0/components/ui/button";
import { Input } from "@z0/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@z0/components/ui/dialog";
import { usePermissions } from "../../../hooks/use-permissions";
import { addClientSecret, fetchClientSecrets, revokeClientSecret } from "../../../lib/apps-api";

export function ClientSecretsDialog({ app, client, onClose }: { app: AppDetail; client: OAuthClientSummary; onClose: () => void }) {
  const { hasScope } = usePermissions();
  const [secrets, setSecrets] = useState<ClientSecretSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [replacementFor, setReplacementFor] = useState<string | undefined>();
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [revoking, setRevoking] = useState<ClientSecretSummary | null>(null);
  const [compromised, setCompromised] = useState(false);
  const [reveal, setReveal] = useState<{ id: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const canAdd = hasScope("apps.clients:rotate") && app.status === "active" && client.status === "active";
  const reload = useCallback(async () => {
    setSecrets(await fetchClientSecrets(app.id, client.id));
  }, [app.id, client.id]);
  useEffect(() => {
    void reload().catch(e => setError(e instanceof Error ? e.message : "Could not load secrets.")).finally(() => setLoading(false));
  }, [reload]);
  const usable = (s: ClientSecretSummary) => s.status === "active" && (!s.expiresAt || Date.parse(s.expiresAt) > Date.now());
  const isLast = revoking && usable(revoking) && !secrets.some(s => s.id !== revoking.id && usable(s)) && app.status === "active" && client.status === "active";
  function startCreate(oldId?: string) {
    setReplacementFor(oldId); setCreating(true); setRevoking(null); setLabel(""); setExpiresAt(""); setError(null);
  }
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const result = await addClientSecret(app.id, client.id, { label: label.trim() || null, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null, replacementFor });
      // Keep the one-time value only in component memory; closing discards it.
      setReveal({ id: result.secret.id, value: result.clientSecret }); setCopied(false); setCreating(false);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add secret."); }
    finally { setBusy(false); }
  }
  async function revoke(e: React.FormEvent) {
    e.preventDefault(); if (!revoking) return;
    setBusy(true); setError(null);
    try {
      await revokeClientSecret(app.id, client.id, revoking.id, { reason: compromised ? "compromised" : "ordinary" });
      setRevoking(null); await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not revoke secret."); await reload().catch(() => {}); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => !open && !busy && onClose()}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader><DialogTitle>Client secrets — {client.label}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Add a secret, deploy it to your service, then revoke the old secret. Adding a secret leaves existing secrets valid. Already-issued access tokens expire normally after revocation.</p>
      <p className="break-all font-mono text-xs">Client ID: {client.clientId}</p>
      {loading ? <p role="status">Loading secrets…</p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs">
        <caption className="sr-only">Secret lifecycle metadata</caption>
        <thead><tr>{["Secret / label", "Status", "Created / creator", "Expires", "Last successful use", "Actions"].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{secrets.map(s => <tr key={s.id} className="border-t">
          <td className="p-2"><p className="font-mono">{s.id}</p>{s.label && <p>{s.label}</p>}</td>
          <td className="p-2">{s.status}{s.revokedAt && <p>{new Date(s.revokedAt).toLocaleString()} ({s.revocationReason})</p>}</td>
          <td className="p-2">{new Date(s.createdAt).toLocaleString()}<p>{s.createdBy ?? "Unknown creator"}</p></td>
          <td className="p-2">{s.expiresAt ? new Date(s.expiresAt).toLocaleString() : "No expiry"}</td>
          <td className="p-2">{s.lastUsedAt ? new Date(s.lastUsedAt).toLocaleString() : "Never used"}</td>
          <td className="p-2">{hasScope("apps.clients:revoke") && s.status !== "revoked" && <Button size="sm" variant="outline" disabled={busy || Boolean(reveal)} onClick={() => { setRevoking(s); setCompromised(false); setCreating(false); setError(null); }}>Revoke</Button>}</td>
        </tr>)}</tbody>
      </table>{!secrets.length && <p>No secrets.</p>}</div>}
      {reveal ? <section className="space-y-3 rounded-md border p-4" aria-label="One-time client secret">
        <h3 className="font-medium">Copy your new client secret</h3>
        <p className="text-sm">Store this value now. It cannot be retrieved after you dismiss it.</p>
        <p className="text-xs font-mono">Secret ID: {reveal.id}</p>
        <p data-testid="client-secret-value" className="break-all rounded-md bg-muted p-3 font-mono text-xs">{reveal.value}</p>
        <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(reveal.value).then(() => setCopied(true)).catch(() => setError("Copy failed. Select and copy the value manually.")); }}>{copied ? "Copied" : "Copy secret"}</Button>
        <Button onClick={() => setReveal(null)}>Done</Button>
      </section> : creating ? <form onSubmit={e => void create(e)} className="space-y-3 rounded-md border p-4">
        <h3 className="font-medium">{replacementFor ? "Add replacement secret" : "Add secret"}</h3>
        {replacementFor && <p className="text-sm">Deploy this replacement before revoking secret {replacementFor}.</p>}
        <label className="block text-sm">Secret label (optional)<Input value={label} maxLength={64} onChange={e => setLabel(e.target.value)} /></label>
        <label className="block text-sm">Secret expiry (optional)<Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></label>
        <p className="text-xs text-muted-foreground">Leave expiry empty for no expiry. Times use your local timezone.</p>
        <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create secret"}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setCreating(false)}>Cancel</Button>
      </form> : revoking ? <form onSubmit={e => void revoke(e)} className="space-y-3 rounded-md border p-4">
        <h3 className="font-medium">Revoke secret {revoking.id}</h3>
        <p className="text-sm">This secret will immediately stop authenticating the Client. Revocation cannot be undone.</p>
        {isLast && <p role="status" className="text-sm">This is the last usable secret. Revoking it stops Client authentication and new token issuance. Create and deploy a replacement before ordinary revocation.</p>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={compromised} onChange={e => setCompromised(e.target.checked)} />Suspected compromise — revoke immediately, even if this is the last secret</label>
        {canAdd && <Button type="button" variant="outline" disabled={busy} onClick={() => startCreate(revoking.id)}>Add replacement</Button>}
        <Button type="submit" variant="destructive" disabled={busy || Boolean(isLast && !compromised)}>{compromised ? "Revoke compromised secret" : "Confirm revocation"}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setRevoking(null)}>Cancel</Button>
      </form> : canAdd && <Button disabled={busy || loading} onClick={() => startCreate()}>Add secret</Button>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button variant="ghost" disabled={busy} onClick={onClose}>Close secrets</Button>
    </DialogContent>
  </Dialog>;
}
