import { useCallback, useEffect, useState } from "react";

import type { SignInMethod } from "@z0/contracts/auth-settings";
import { SIGN_IN_METHODS } from "@z0/contracts/auth-settings";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent } from "@z0/components/ui/card";
import { Checkbox } from "@z0/components/ui/checkbox";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";
import { FormField } from "../../../components/forms/FormField";
import { FormActions } from "../../../components/forms/FormActions";
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { useAppWorkspace } from "../../../context/app-workspace-context";
import { usePageBreadcrumbs } from "../../../hooks/use-page-breadcrumbs";
import { ApiError } from "../../../lib/api";
import { fieldErrorsFromProblem } from "../../../lib/form-errors";
import { fetchAppSignInSettings, putAppSignInSettings } from "../../../lib/auth-settings-api";
import { fetchAppFederationSettings, putAppFederationSettings } from "../../../lib/federation-api";

const METHOD_LABELS: Record<SignInMethod, string> = {
  password: "Email and password",
  magic_link: "Email link (passwordless)",
};

export function AppSignInPage() {
  const { appId, app } = useAppWorkspace();
  const [methods, setMethods] = useState<SignInMethod[]>(["password"]);
  const [brandingName, setBrandingName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [federationProviders, setFederationProviders] = useState<
    { providerId: string; displayName: string; instanceEnabled: boolean; appEnabled: boolean }[]
  >([]);

  usePageBreadcrumbs(
    [
      { label: "Apps", to: "/apps" },
      { label: app.name, to: `/apps/${appId}/setup` },
      { label: "Sign-in page" },
    ],
    [app.name, appId],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = await fetchAppSignInSettings(appId);
      setMethods(settings.signInMethods);
      setBrandingName(settings.branding.name ?? app.name);
      setLogoUrl(settings.branding.logoUrl ?? "");
      setPrimaryColor(settings.branding.primaryColor ?? "");
      const federation = await fetchAppFederationSettings(appId);
      setFederationProviders(
        federation.providers.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          instanceEnabled: provider.instanceEnabled,
          appEnabled: provider.appEnabled,
        })),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load sign-in settings.");
    } finally {
      setLoading(false);
    }
  }, [app.name, appId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function toggleMethod(method: SignInMethod, checked: boolean) {
    setMethods((current) => {
      const next = checked ? [...new Set([...current, method])] : current.filter((item) => item !== method);
      return next.length ? next : ["password"];
    });
  }

  function toggleFederationProvider(providerId: string, checked: boolean) {
    setFederationProviders((current) =>
      current.map((provider) =>
        provider.providerId === providerId ? { ...provider, appEnabled: checked } : provider,
      ),
    );
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    setFieldErrors({});
    try {
      const updated = await putAppSignInSettings(appId, {
        signInMethods: methods,
        branding: {
          name: brandingName.trim() || null,
          logoUrl: logoUrl.trim() || null,
          primaryColor: primaryColor.trim() || null,
        },
      });
      setMethods(updated.signInMethods);
      setBrandingName(updated.branding.name ?? app.name);
      setLogoUrl(updated.branding.logoUrl ?? "");
      setPrimaryColor(updated.branding.primaryColor ?? "");
      const federation = await putAppFederationSettings(appId, {
        providers: federationProviders.map((provider, index) => ({
          providerId: provider.providerId,
          enabled: provider.appEnabled,
          sortOrder: index,
        })),
      });
      setFederationProviders(
        federation.providers.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          instanceEnabled: provider.instanceEnabled,
          appEnabled: provider.appEnabled,
        })),
      );
      setNotice("Sign-in page settings saved.");
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(fieldErrorsFromProblem(e.problem));
        setNotice(e.message);
      } else {
        setNotice("Could not save sign-in settings.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ListPageSkeleton />;

  if (error) {
    return <PageError message={error} onRetry={() => void reload()} />;
  }

  const previewName = brandingName.trim() || app.name;
  const previewColor = primaryColor.trim() || "#2563eb";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Sign-in page</h2>
        <p className="text-sm text-muted-foreground">
          Choose how people sign in to this app and how the hosted page looks.
        </p>
      </div>

      <ActionNotice message={notice} />

      <form onSubmit={(e) => void handleSave(e)} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 py-4">
              <p className="text-sm font-medium">Sign-in methods</p>
              {SIGN_IN_METHODS.map((method) => (
                <div key={method} className="flex items-start gap-3">
                  <Checkbox
                    id={`app-method-${method}`}
                    checked={methods.includes(method)}
                    onCheckedChange={(checked) => toggleMethod(method, checked === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor={`app-method-${method}`}>{METHOD_LABELS[method]}</Label>
                    {method === "magic_link" ? (
                      <p className="text-sm text-muted-foreground">
                        Requires verified email settings. Existing users only.
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {federationProviders.some((provider) => provider.instanceEnabled) ? (
            <Card>
              <CardContent className="space-y-4 py-4">
                <p className="text-sm font-medium">Social sign-in</p>
                {federationProviders
                  .filter((provider) => provider.instanceEnabled)
                  .map((provider) => (
                    <div key={provider.providerId} className="flex items-start gap-3">
                      <Checkbox
                        id={`fed-${provider.providerId}`}
                        checked={provider.appEnabled}
                        onCheckedChange={(checked) => toggleFederationProvider(provider.providerId, checked === true)}
                      />
                      <Label htmlFor={`fed-${provider.providerId}`}>{provider.displayName}</Label>
                    </div>
                  ))}
              </CardContent>
            </Card>
          ) : null}

          <FormField label="App name on sign-in page" htmlFor="brandingName">
            <Input id="brandingName" value={brandingName} onChange={(e) => setBrandingName(e.target.value)} />
          </FormField>

          <FormField label="Logo URL" htmlFor="logoUrl" error={fieldErrors["branding.logoUrl"]}>
            <Input id="logoUrl" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
          </FormField>

          <FormField label="Primary color" htmlFor="primaryColor" error={fieldErrors["branding.primaryColor"]}>
            <Input id="primaryColor" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="#2563eb" />
          </FormField>

          <FormActions>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </FormActions>
        </div>

        <aside className="space-y-2">
          <p className="text-sm font-medium">Preview</p>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="mx-auto max-w-xs rounded-lg border bg-background p-4 shadow-sm">
              {logoUrl.trim() ? (
                <img src={logoUrl.trim()} alt="" className="mx-auto mb-3 h-10 w-10 object-contain" />
              ) : null}
              <p className="text-center text-sm font-semibold">{previewName}</p>
              <div className="mt-4 h-9 rounded-md" style={{ backgroundColor: previewColor }} />
              <p className="mt-2 text-center text-xs text-muted-foreground">Hosted sign-in button color</p>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
