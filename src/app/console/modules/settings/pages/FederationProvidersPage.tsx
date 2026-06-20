import { useCallback, useEffect, useState } from "react";

import type { BuiltinProviderId, IdentityProviderResponse } from "@z0/contracts/federation";
import { BUILTIN_PROVIDER_IDS } from "@z0/contracts/federation";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent } from "@z0/components/ui/card";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";
import { Switch } from "@z0/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@z0/components/ui/select";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { FormField } from "../../../components/forms/FormField";
import { FormActions } from "../../../components/forms/FormActions";
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { ApiError } from "../../../lib/api";
import { fieldErrorsFromProblem } from "../../../lib/form-errors";
import {
  createCustomProvider,
  createProviderFromTemplate,
  deleteIdentityProvider,
  fetchIdentityProviders,
  patchIdentityProvider,
} from "../../../lib/federation-api";

const BUILTIN_LABELS: Record<BuiltinProviderId, string> = {
  github: "GitHub",
  google: "Google",
  apple: "Apple",
  facebook: "Facebook",
};

export function FederationProvidersPage() {
  const [providers, setProviders] = useState<IdentityProviderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<"builtin" | "custom">("builtin");
  const [builtinId, setBuiltinId] = useState<BuiltinProviderId>("github");
  const [customKey, setCustomKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const [tokenUrl, setTokenUrl] = useState("");
  const [userinfoUrl, setUserinfoUrl] = useState("");
  const [defaultScopes, setDefaultScopes] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchIdentityProviders();
      setProviders(result.providers);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load sign-in providers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    setFieldErrors({});
    try {
      if (mode === "builtin") {
        await createProviderFromTemplate({
          builtinId,
          displayName: displayName.trim() || undefined,
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          enabled: true,
        });
      } else {
        await createCustomProvider({
          key: customKey.trim(),
          displayName: displayName.trim(),
          authorizationUrl: authorizationUrl.trim(),
          tokenUrl: tokenUrl.trim(),
          userinfoUrl: userinfoUrl.trim(),
          defaultScopes: defaultScopes.trim(),
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          enabled: true,
        });
      }
      setClientSecret("");
      setNotice("Provider saved.");
      await reload();
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(fieldErrorsFromProblem(e.problem));
        setNotice(e.message);
      } else {
        setNotice("Could not save provider.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleProvider(provider: IdentityProviderResponse, enabled: boolean) {
    setNotice(null);
    try {
      await patchIdentityProvider(provider.id, { enabled });
      await reload();
      setNotice(`${provider.displayName} ${enabled ? "enabled" : "disabled"}.`);
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not update provider.");
    }
  }

  async function removeProvider(provider: IdentityProviderResponse) {
    setNotice(null);
    try {
      await deleteIdentityProvider(provider.id);
      await reload();
      setNotice(`${provider.displayName} removed.`);
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not remove provider.");
    }
  }

  if (loading) return <ListPageSkeleton />;

  if (error) {
    return <PageError message={error} onRetry={() => void reload()} />;
  }

  const configuredKeys = new Set(providers.map((provider) => provider.key));

  return (
    <div className="space-y-6">
      <ListPageHeader title="Sign-in providers" />
      <p className="text-sm text-muted-foreground">
        Connect external OAuth providers. App developers choose which ones to show on their hosted sign-in page.
      </p>

      <ActionNotice message={notice} />

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Configured providers</h2>
        {providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No providers configured yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {providers.map((provider) => (
              <li key={provider.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{provider.displayName}</p>
                  <p className="text-sm text-muted-foreground">
                    Key: {provider.key} · Callback: {provider.callbackUrl}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`provider-enabled-${provider.id}`}
                      checked={provider.enabled}
                      onCheckedChange={(checked) => void toggleProvider(provider, checked)}
                    />
                    <Label htmlFor={`provider-enabled-${provider.id}`}>Enabled</Label>
                  </div>
                  <Button type="button" variant="outline" onClick={() => void removeProvider(provider)}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card>
        <CardContent className="space-y-4 py-4">
          <p className="text-sm font-medium">Add a provider</p>
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <FormField label="Type" htmlFor="provider-type">
              <Select value={mode} onValueChange={(value) => setMode(value as "builtin" | "custom")}>
                <SelectTrigger id="provider-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="builtin">Built-in (Google, GitHub, …)</SelectItem>
                  <SelectItem value="custom">Custom OAuth</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            {mode === "builtin" ? (
              <FormField label="Provider" htmlFor="builtinId">
                <Select value={builtinId} onValueChange={(value) => setBuiltinId(value as BuiltinProviderId)}>
                  <SelectTrigger id="builtinId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BUILTIN_PROVIDER_IDS.filter((id) => !configuredKeys.has(id)).map((id) => (
                      <SelectItem key={id} value={id}>
                        {BUILTIN_LABELS[id]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            ) : (
              <>
                <FormField label="Key" htmlFor="customKey" error={fieldErrors.key}>
                  <Input id="customKey" value={customKey} onChange={(e) => setCustomKey(e.target.value)} placeholder="todoist" />
                </FormField>
                <FormField label="Authorization URL" htmlFor="authorizationUrl" error={fieldErrors.authorizationUrl}>
                  <Input id="authorizationUrl" value={authorizationUrl} onChange={(e) => setAuthorizationUrl(e.target.value)} />
                </FormField>
                <FormField label="Token URL" htmlFor="tokenUrl" error={fieldErrors.tokenUrl}>
                  <Input id="tokenUrl" value={tokenUrl} onChange={(e) => setTokenUrl(e.target.value)} />
                </FormField>
                <FormField label="Userinfo URL" htmlFor="userinfoUrl" error={fieldErrors.userinfoUrl}>
                  <Input id="userinfoUrl" value={userinfoUrl} onChange={(e) => setUserinfoUrl(e.target.value)} />
                </FormField>
                <FormField label="Default scopes" htmlFor="defaultScopes">
                  <Input id="defaultScopes" value={defaultScopes} onChange={(e) => setDefaultScopes(e.target.value)} />
                </FormField>
              </>
            )}

            <FormField label="Display name" htmlFor="displayName">
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Optional" />
            </FormField>
            <FormField label="Client ID" htmlFor="clientId" error={fieldErrors.clientId}>
              <Input id="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            </FormField>
            <FormField label="Client secret" htmlFor="clientSecret" error={fieldErrors.clientSecret}>
              <Input id="clientSecret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
            </FormField>

            <FormActions>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Add provider"}
              </Button>
            </FormActions>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
