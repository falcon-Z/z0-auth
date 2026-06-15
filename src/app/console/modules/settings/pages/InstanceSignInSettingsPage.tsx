import { useCallback, useEffect, useState } from "react";

import type { SignInMethod } from "@z0/contracts/auth-settings";
import { SIGN_IN_METHODS } from "@z0/contracts/auth-settings";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent } from "@z0/components/ui/card";
import { Checkbox } from "@z0/components/ui/checkbox";
import { Label } from "@z0/components/ui/label";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { FormActions } from "../../../components/forms/FormActions";
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { ApiError } from "../../../lib/api";
import { fetchInstanceSignInSettings, putInstanceSignInSettings } from "../../../lib/auth-settings-api";

const METHOD_LABELS: Record<SignInMethod, string> = {
  password: "Email and password",
  magic_link: "Email link (passwordless)",
};

export function InstanceSignInSettingsPage() {
  const [methods, setMethods] = useState<SignInMethod[]>(["password"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = await fetchInstanceSignInSettings();
      setMethods(settings.signInMethods);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load sign-in settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function toggleMethod(method: SignInMethod, checked: boolean) {
    setMethods((current) => {
      const next = checked ? [...new Set([...current, method])] : current.filter((item) => item !== method);
      return next.length ? next : ["password"];
    });
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const updated = await putInstanceSignInSettings({ signInMethods: methods });
      setMethods(updated.signInMethods);
      setNotice("Sign-in settings saved.");
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not save sign-in settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ListPageSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <ListPageHeader title="Sign-in" />
        <PageError message={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ListPageHeader
        title="Sign-in"
        description="Choose how console members sign in. Email link is enabled automatically when email is verified."
      />
      <ActionNotice message={notice} />

      <form onSubmit={(e) => void handleSave(e)} className="max-w-xl space-y-6">
        <Card>
          <CardContent className="space-y-4 py-4">
            {SIGN_IN_METHODS.map((method) => (
              <div key={method} className="flex items-start gap-3">
                <Checkbox
                  id={`method-${method}`}
                  checked={methods.includes(method)}
                  onCheckedChange={(checked) => toggleMethod(method, checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor={`method-${method}`}>{METHOD_LABELS[method]}</Label>
                  {method === "magic_link" ? (
                    <p className="text-sm text-muted-foreground">
                      Sends a one-time sign-in link. Enabled automatically when email is verified.
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <FormActions>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </FormActions>
      </form>
    </div>
  );
}
