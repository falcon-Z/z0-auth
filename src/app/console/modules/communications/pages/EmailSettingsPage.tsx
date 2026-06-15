import { useCallback, useEffect, useMemo, useState } from "react";

import type { EmailSettingsResponse, SmtpEncryption } from "@z0/contracts/email-settings";
import { SMTP_PROVIDER_PRESETS, type SmtpProviderPresetId } from "@z0/contracts/smtp-presets";
import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
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
import { fetchEmailSettings, putEmailSettings, sendTestEmail } from "../../../lib/email-settings-api";

function detectPreset(settings: EmailSettingsResponse): SmtpProviderPresetId {
  const match = SMTP_PROVIDER_PRESETS.find(
    (preset) =>
      preset.id !== "custom" &&
      preset.host === settings.host &&
      preset.port === settings.port &&
      preset.encryption === settings.encryption,
  );
  return match?.id ?? "custom";
}

export function EmailSettingsPage() {
  const [settings, setSettings] = useState<EmailSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [presetId, setPresetId] = useState<SmtpProviderPresetId>("custom");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [encryption, setEncryption] = useState<SmtpEncryption>("starttls");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [testTo, setTestTo] = useState("");

  const selectedPreset = useMemo(
    () => SMTP_PROVIDER_PRESETS.find((preset) => preset.id === presetId),
    [presetId],
  );

  const applySettings = useCallback((s: EmailSettingsResponse) => {
    setSettings(s);
    setPresetId(detectPreset(s));
    setHost(s.host);
    setPort(String(s.port));
    setEncryption(s.encryption);
    setUsername(s.username ?? "");
    setFromAddress(s.fromAddress);
    setFromName(s.fromName ?? "");
    setEnabled(s.enabled);
    setPassword("");
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEmailSettings();
      applySettings(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load email settings.");
    } finally {
      setLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function applyPreset(id: SmtpProviderPresetId) {
    setPresetId(id);
    const preset = SMTP_PROVIDER_PRESETS.find((item) => item.id === id);
    if (!preset || preset.id === "custom") return;
    setHost(preset.host);
    setPort(String(preset.port));
    setEncryption(preset.encryption);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    setFieldErrors({});
    try {
      const body = {
        host,
        port: Number(port),
        encryption,
        username: username.trim() || null,
        fromAddress,
        fromName: fromName.trim() || null,
        enabled,
        ...(password ? { password } : {}),
      };
      const updated = await putEmailSettings(body);
      applySettings(updated);
      setNotice("Settings saved. Send a test email to enable automated delivery.");
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(fieldErrorsFromProblem(e.problem));
        setNotice(e.message);
      } else {
        setNotice("Could not save settings.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleTestSend() {
    setTesting(true);
    setNotice(null);
    setFieldErrors({});
    try {
      const result = await sendTestEmail({ to: testTo });
      await reload();
      setNotice(`Test email sent. Verified at ${new Date(result.verifiedAt).toLocaleString()}.`);
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(fieldErrorsFromProblem(e.problem));
        setNotice(e.message);
      } else {
        setNotice("Could not send test email.");
      }
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <ListPageSkeleton />;

  if (error || !settings) {
    return (
      <div className="space-y-6">
        <ListPageHeader title="Email" />
        <PageError message={error ?? "Could not load settings."} onRetry={() => void reload()} />
      </div>
    );
  }

  const readOnly = settings.readOnly;

  return (
    <div className="space-y-6">
      <ListPageHeader title="Email" />

      <ActionNotice message={notice} />

      {readOnly ? (
        <Alert>
          <AlertTitle>Managed by environment variables</AlertTitle>
          <AlertDescription>
            SMTP is configured from server env vars. Update SMTP_HOST, SMTP_PASSWORD, and related vars, then restart the app.
          </AlertDescription>
        </Alert>
      ) : null}

      {!settings.verifiedAt && settings.configured ? (
        <Alert>
          <AlertTitle>Send a test email</AlertTitle>
          <AlertDescription>
            Automated invites, password reset, and magic links stay off until a test email succeeds.
          </AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={(e) => void handleSave(e)} className="max-w-xl space-y-6">
        <Card>
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div className="space-y-1">
              <Label htmlFor="smtp-enabled" className="text-sm font-medium">
                Enable SMTP
              </Label>
              <p className="text-sm text-muted-foreground">Required for automated email delivery.</p>
            </div>
            <Switch
              id="smtp-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={readOnly}
              aria-label="Enable SMTP"
            />
          </CardContent>
        </Card>

        <FormField label="Provider" htmlFor="smtpProvider">
          <Select value={presetId} onValueChange={(value) => applyPreset(value as SmtpProviderPresetId)} disabled={readOnly}>
            <SelectTrigger id="smtpProvider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SMTP_PROVIDER_PRESETS.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPreset?.hint ? <p className="text-sm text-muted-foreground">{selectedPreset.hint}</p> : null}
        </FormField>

        <FormField label="SMTP host" htmlFor="smtpHost" error={fieldErrors.host}>
          <Input
            id="smtpHost"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="smtp.example.com"
            disabled={readOnly}
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Port" htmlFor="smtpPort" error={fieldErrors.port}>
            <Input
              id="smtpPort"
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              disabled={readOnly}
            />
          </FormField>

          <FormField label="Encryption" htmlFor="smtpEncryption" error={fieldErrors.encryption}>
            <Select
              value={encryption}
              onValueChange={(v) => setEncryption(v as SmtpEncryption)}
              disabled={readOnly}
            >
              <SelectTrigger id="smtpEncryption">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="starttls">STARTTLS (587)</SelectItem>
                <SelectItem value="tls">TLS (465)</SelectItem>
                <SelectItem value="none">None (dev only)</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <FormField label="Username" htmlFor="smtpUser" error={fieldErrors.username}>
          <Input
            id="smtpUser"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            disabled={readOnly}
          />
        </FormField>

        <FormField
          label="Password"
          htmlFor="smtpPassword"
          error={fieldErrors.password}
          hint={settings.hasPassword ? "Leave blank to keep the current password." : undefined}
        >
          <Input
            id="smtpPassword"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            disabled={readOnly}
          />
        </FormField>

        <FormField label="From address" htmlFor="fromAddress" error={fieldErrors.fromAddress}>
          <Input
            id="fromAddress"
            type="email"
            value={fromAddress}
            onChange={(e) => setFromAddress(e.target.value)}
            placeholder="noreply@example.com"
            disabled={readOnly}
          />
        </FormField>

        <FormField label="From name" htmlFor="fromName" error={fieldErrors.fromName}>
          <Input
            id="fromName"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="Acme IAM"
            disabled={readOnly}
          />
        </FormField>

        {settings.verifiedAt ? (
          <p className="text-sm text-muted-foreground">
            Last verified: {new Date(settings.verifiedAt).toLocaleString()}
          </p>
        ) : null}

        {!readOnly ? (
          <FormActions>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </FormActions>
        ) : null}
      </form>

      <section className="max-w-xl space-y-3 border-t pt-6">
        <Label htmlFor="testTo">Send test email</Label>
        <p className="text-sm text-muted-foreground">
          A successful test marks SMTP as verified for automated delivery.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="testTo"
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@example.com"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            disabled={testing || !testTo.trim() || !settings.configured}
            onClick={() => void handleTestSend()}
          >
            {testing ? "Sending…" : "Send test"}
          </Button>
        </div>
        {fieldErrors.to ? <p className="text-sm text-destructive">{fieldErrors.to}</p> : null}
        {fieldErrors._smtp ? <p className="text-sm text-destructive">{fieldErrors._smtp}</p> : null}
      </section>
    </div>
  );
}
