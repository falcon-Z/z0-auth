import { useCallback, useEffect, useState } from "react";

import type { EmailSettingsResponse, SmtpEncryption } from "@z0/contracts/email-settings";
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
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { ApiError } from "../../../lib/api";
import { fieldErrorsFromProblem } from "../../../lib/form-errors";
import { fetchEmailSettings, putEmailSettings, sendTestEmail } from "../../../lib/email-settings-api";

export function EmailSettingsPage() {
  const [settings, setSettings] = useState<EmailSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [encryption, setEncryption] = useState<SmtpEncryption>("starttls");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [testTo, setTestTo] = useState("");

  const applySettings = useCallback((s: EmailSettingsResponse) => {
    setSettings(s);
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
      setNotice("Settings saved.");
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

  return (
    <div className="space-y-6">
      <ListPageHeader title="Email" />

      <ActionNotice message={notice} />

      <form onSubmit={(e) => void handleSave(e)} className="max-w-xl space-y-6">
        <Card>
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div className="space-y-1">
              <Label htmlFor="smtp-enabled" className="text-sm font-medium">
                Enable SMTP
              </Label>
              <p className="text-sm text-muted-foreground">Required for self-service password reset.</p>
            </div>
            <Switch id="smtp-enabled" checked={enabled} onCheckedChange={setEnabled} aria-label="Enable SMTP" />
          </CardContent>
        </Card>

        <FormField label="SMTP host" htmlFor="smtpHost" error={fieldErrors.host}>
          <Input id="smtpHost" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.example.com" />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Port" htmlFor="smtpPort" error={fieldErrors.port}>
            <Input id="smtpPort" type="number" value={port} onChange={(e) => setPort(e.target.value)} />
          </FormField>

          <FormField label="Encryption" htmlFor="smtpEncryption" error={fieldErrors.encryption}>
            <Select value={encryption} onValueChange={(v) => setEncryption(v as SmtpEncryption)}>
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
          />
        </FormField>

        <FormField label="From address" htmlFor="fromAddress" error={fieldErrors.fromAddress}>
          <Input
            id="fromAddress"
            type="email"
            value={fromAddress}
            onChange={(e) => setFromAddress(e.target.value)}
            placeholder="noreply@example.com"
          />
        </FormField>

        <FormField label="From name" htmlFor="fromName" error={fieldErrors.fromName}>
          <Input id="fromName" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Acme IAM" />
        </FormField>

        {settings.verifiedAt ? (
          <p className="text-sm text-muted-foreground">
            Last verified: {new Date(settings.verifiedAt).toLocaleString()}
          </p>
        ) : null}

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </form>

      <section className="max-w-xl space-y-3 border-t pt-6">
        <Label htmlFor="testTo">Send test email</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="testTo"
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@example.com"
            className="flex-1"
          />
          <Button type="button" variant="outline" disabled={testing || !testTo.trim()} onClick={() => void handleTestSend()}>
            {testing ? "Sending…" : "Send test"}
          </Button>
        </div>
        {fieldErrors.to ? <p className="text-sm text-destructive">{fieldErrors.to}</p> : null}
        {fieldErrors._smtp ? <p className="text-sm text-destructive">{fieldErrors._smtp}</p> : null}
      </section>
    </div>
  );
}
