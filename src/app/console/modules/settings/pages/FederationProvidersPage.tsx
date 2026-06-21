import { useCallback, useEffect, useMemo, useState } from "react";

import type { BuiltinProviderId, IdentityProviderResponse } from "@z0/contracts/federation";
import { BUILTIN_PROVIDER_IDS } from "@z0/contracts/federation";
import { BUILTIN_PROVIDER_SETUP_GUIDES } from "@z0/api/lib/federation-builtin";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent } from "@z0/components/ui/card";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";
import { Switch } from "@z0/components/ui/switch";
import { Textarea } from "@z0/components/ui/textarea";
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

const CALLBACK_PREVIEW_ORIGIN =
  typeof window !== "undefined" ? window.location.origin : "https://auth.example.com";

export function FederationProvidersPage() {
  const [providers, setProviders] = useState<IdentityProviderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<"builtin" | "custom">("builtin");
  const [builtinId, setBuiltinId] = useState<BuiltinProviderId>("google");
  const [customKey, setCustomKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [appleTeamId, setAppleTeamId] = useState("");
  const [appleKeyId, setAppleKeyId] = useState("");
  const [applePrivateKey, setApplePrivateKey] = useState("");
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

  const setupGuide = useMemo(() => BUILTIN_PROVIDER_SETUP_GUIDES[builtinId], [builtinId]);
  const callbackPreview = `${CALLBACK_PREVIEW_ORIGIN}/auth/federation/${builtinId}/callback`;

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
          clientSecret: builtinId === "apple" ? undefined : clientSecret.trim(),
          appleTeamId: builtinId === "apple" ? appleTeamId.trim() : undefined,
          appleKeyId: builtinId === "apple" ? appleKeyId.trim() : undefined,
          applePrivateKey: builtinId === "apple" ? applePrivateKey.trim() : undefined,
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
      setApplePrivateKey("");
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
  const availableBuiltins = BUILTIN_PROVIDER_IDS.filter((id) => !configuredKeys.has(id));

  return (
    <div className="space-y-6">
      <ListPageHeader title="Sign-in providers" />
      <p className="text-sm text-muted-foreground">
        Connect Google, Apple, GitHub, and Facebook. App developers choose which providers appear on their hosted sign-in page.
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
                  <p className="text-sm text-muted-foreground break-all">
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
                  <SelectItem value="builtin">Built-in provider</SelectItem>
                  <SelectItem value="custom">Custom OAuth</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            {mode === "builtin" ? (
              <>
                <FormField label="Provider" htmlFor="builtinId">
                  <Select value={builtinId} onValueChange={(value) => setBuiltinId(value as BuiltinProviderId)}>
                    <SelectTrigger id="builtinId">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableBuiltins.map((id) => (
                        <SelectItem key={id} value={id}>
                          {BUILTIN_LABELS[id]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
                  <p className="font-medium">{setupGuide.displayName}</p>
                  <p className="text-muted-foreground">{setupGuide.summary}</p>
                  <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                    {setupGuide.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <p className="text-muted-foreground">
                    Callback URL: <span className="font-mono text-foreground break-all">{callbackPreview}</span>
                  </p>
                  <a className="text-primary underline-offset-4 hover:underline" href={setupGuide.docsUrl} target="_blank" rel="noreferrer">
                    Provider documentation
                  </a>
                </div>
              </>
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
            <FormField label={builtinId === "apple" && mode === "builtin" ? "Services ID" : "Client ID"} htmlFor="clientId" error={fieldErrors.clientId}>
              <Input id="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            </FormField>

            {mode === "builtin" && builtinId === "apple" ? (
              <>
                <FormField label="Team ID" htmlFor="appleTeamId" error={fieldErrors.appleTeamId}>
                  <Input id="appleTeamId" value={appleTeamId} onChange={(e) => setAppleTeamId(e.target.value)} />
                </FormField>
                <FormField label="Key ID" htmlFor="appleKeyId" error={fieldErrors.appleKeyId}>
                  <Input id="appleKeyId" value={appleKeyId} onChange={(e) => setAppleKeyId(e.target.value)} />
                </FormField>
                <FormField label="Private key (.p8)" htmlFor="applePrivateKey" error={fieldErrors.applePrivateKey}>
                  <Textarea
                    id="applePrivateKey"
                    value={applePrivateKey}
                    onChange={(e) => setApplePrivateKey(e.target.value)}
                    rows={6}
                    placeholder="-----BEGIN PRIVATE KEY-----"
                  />
                </FormField>
              </>
            ) : (
              <FormField label="Client secret" htmlFor="clientSecret" error={fieldErrors.clientSecret}>
                <Input id="clientSecret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
              </FormField>
            )}

            <FormActions>
              <Button type="submit" disabled={saving || (mode === "builtin" && availableBuiltins.length === 0)}>
                {saving ? "Saving…" : "Add provider"}
              </Button>
            </FormActions>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
