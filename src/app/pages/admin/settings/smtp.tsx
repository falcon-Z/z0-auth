import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  Mail,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Send,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";

import { Button } from "@z0/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@z0/components/ui/card";
import { Input } from "@z0/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@z0/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { Switch } from "@z0/components/ui/switch";
import { Badge } from "@z0/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@z0/components/ui/dialog";

const smtpConfigSchema = z.object({
  host: z.string().min(1, "SMTP host is required"),
  port: z.coerce.number().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  fromName: z.string().min(1, "From name is required"),
  fromEmail: z.string().email("Valid from email is required"),
});

type SMTPConfigFormValues = z.infer<typeof smtpConfigSchema>;

interface SMTPConfigResponse {
  configured: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: {
    user: string;
    password: string;
  };
  from?: {
    name: string;
    email: string;
  };
}

export default function SMTPSettings() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [config, setConfig] = useState<SMTPConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const form = useForm<SMTPConfigFormValues>({
    resolver: zodResolver(smtpConfigSchema),
    defaultValues: {
      host: "",
      port: 587,
      secure: false,
      username: "",
      password: "",
      fromName: "Z0 Auth",
      fromEmail: "",
    },
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/smtp/config", {
        credentials: "include",
      });
      const data = await response.json();

      if (data.success && data.data) {
        setConfig(data.data);

        if (data.data.configured) {
          form.reset({
            host: data.data.host ?? "",
            port: data.data.port ?? 587,
            secure: data.data.secure ?? false,
            username: data.data.auth?.user ?? "",
            password: "", // Don't populate password
            fromName: data.data.from?.name ?? "Z0 Auth",
            fromEmail: data.data.from?.email ?? "",
          });
        }
      }
    } catch (err) {
      setError("Failed to load SMTP configuration");
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: SMTPConfigFormValues) => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/smtp/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSuccess("SMTP configuration saved successfully");
        await fetchConfig();
      } else {
        setError(result.message || "Failed to save configuration");
      }
    } catch (err) {
      setError("An error occurred while saving configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/admin/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recipientEmail: testEmail }),
      });

      const result = await response.json();

      setTestResult({
        success: result.success,
        message: result.message,
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: "Failed to send test email",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDeleteConfig = async () => {
    setIsDeleting(true);

    try {
      const response = await fetch("/api/admin/smtp/config", {
        method: "DELETE",
        credentials: "include",
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSuccess("SMTP configuration deleted successfully");
        setConfig({ configured: false });
        form.reset({
          host: "",
          port: 587,
          secure: false,
          username: "",
          password: "",
          fromName: "Z0 Auth",
          fromEmail: "",
        });
        setDeleteDialogOpen(false);
      } else {
        setError(result.message || "Failed to delete configuration");
      }
    } catch (err) {
      setError("An error occurred while deleting configuration");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/admin")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                <Mail className="h-8 w-8" />
                SMTP Configuration
              </h1>
              <p className="text-muted-foreground mt-1">
                Configure email server settings for sending verification emails,
                password resets, and notifications.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Status Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Connection Status</span>
              {config?.configured ? (
                <Badge className="bg-green-500">Configured</Badge>
              ) : (
                <Badge variant="secondary">Not Configured</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {config?.configured ? (
              <div className="flex items-center gap-4">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <p className="font-medium">SMTP is configured</p>
                  <p className="text-sm text-muted-foreground">
                    Server: {config.host}:{config.port}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <XCircle className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">SMTP is not configured</p>
                  <p className="text-sm text-muted-foreground">
                    Configure your SMTP server to enable email functionality.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              {success}
            </AlertDescription>
          </Alert>
        )}

        {/* Configuration Form */}
        <Card>
          <CardHeader>
            <CardTitle>SMTP Server Settings</CardTitle>
            <CardDescription>
              Enter your SMTP server details. Common providers include Gmail,
              SendGrid, Mailgun, and Amazon SES.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                {/* Server Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="host"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SMTP Host</FormLabel>
                        <FormControl>
                          <Input placeholder="smtp.gmail.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Port</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="587"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Common ports: 587 (TLS), 465 (SSL), 25 (unsecured)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="secure"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Use SSL/TLS Connection
                        </FormLabel>
                        <FormDescription>
                          Enable for port 465. For port 587, leave disabled
                          (STARTTLS will be used).
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Authentication */}
                <div className="space-y-4">
                  <h4 className="font-medium">Authentication</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="user@example.com"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder={
                                  config?.configured
                                    ? "Enter new password to change"
                                    : "Enter password"
                                }
                                {...field}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </FormControl>
                          <FormDescription>
                            For Gmail, use an App Password instead of your
                            account password.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Sender Details */}
                <div className="space-y-4">
                  <h4 className="font-medium">Sender Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="fromName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>From Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Z0 Auth" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="fromEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>From Email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="noreply@example.com"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex items-center gap-2">
                    {config?.configured && (
                      <>
                        <Dialog
                          open={testDialogOpen}
                          onOpenChange={setTestDialogOpen}
                        >
                          <DialogTrigger asChild>
                            <Button type="button" variant="outline">
                              <Send className="mr-2 h-4 w-4" />
                              Send Test Email
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Send Test Email</DialogTitle>
                              <DialogDescription>
                                Enter an email address to send a test email and
                                verify your SMTP configuration.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <Input
                                type="email"
                                placeholder="test@example.com"
                                value={testEmail}
                                onChange={(e) => setTestEmail(e.target.value)}
                              />
                              {testResult && (
                                <Alert
                                  variant={
                                    testResult.success
                                      ? "default"
                                      : "destructive"
                                  }
                                >
                                  {testResult.success ? (
                                    <CheckCircle2 className="h-4 w-4" />
                                  ) : (
                                    <XCircle className="h-4 w-4" />
                                  )}
                                  <AlertDescription>
                                    {testResult.message}
                                  </AlertDescription>
                                </Alert>
                              )}
                            </div>
                            <DialogFooter>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setTestDialogOpen(false)}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                onClick={handleTestEmail}
                                disabled={isTesting || !testEmail}
                              >
                                {isTesting && (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Send Test
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>

                        <Dialog
                          open={deleteDialogOpen}
                          onOpenChange={setDeleteDialogOpen}
                        >
                          <DialogTrigger asChild>
                            <Button type="button" variant="outline">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Config
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Delete SMTP Configuration</DialogTitle>
                              <DialogDescription>
                                Are you sure you want to delete the SMTP
                                configuration? Email functionality will be
                                disabled.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setDeleteDialogOpen(false)}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                onClick={handleDeleteConfig}
                                disabled={isDeleting}
                              >
                                {isDeleting && (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Delete
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </>
                    )}
                  </div>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save Configuration
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Help Card */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Common SMTP Providers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div className="border rounded-lg p-3">
                <p className="font-medium">Gmail</p>
                <p className="text-muted-foreground">smtp.gmail.com:587</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use App Password
                </p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="font-medium">SendGrid</p>
                <p className="text-muted-foreground">smtp.sendgrid.net:587</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use API key as password
                </p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="font-medium">Mailgun</p>
                <p className="text-muted-foreground">smtp.mailgun.org:587</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="font-medium">Amazon SES</p>
                <p className="text-muted-foreground">
                  email-smtp.region.amazonaws.com:587
                </p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="font-medium">Postmark</p>
                <p className="text-muted-foreground">smtp.postmarkapp.com:587</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="font-medium">Microsoft 365</p>
                <p className="text-muted-foreground">smtp.office365.com:587</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
