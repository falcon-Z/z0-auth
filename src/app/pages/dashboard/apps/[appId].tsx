import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Loader2,
  Copy,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Button } from "@z0/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@z0/components/ui/card";
import { Alert, AlertDescription } from "@z0/components/ui/alert";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@z0/components/ui/tabs";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";
import { Badge } from "@z0/components/ui/badge";
import { Separator } from "@z0/components/ui/separator";
import { toast } from "sonner";

interface App {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
  allowedOrigins?: string[];
}

export default function AppDetail() {
  const navigate = useNavigate();
  const { id, appId } = useParams<{ id: string; appId: string }>();
  const [app, setApp] = useState<App | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);

  useEffect(() => {
    if (id && appId) {
      loadAppDetail();
    }
  }, [id, appId]);

  const loadAppDetail = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`/api/v1/orgs/${id}/apps/${appId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load application");
      }

      const result = await response.json();
      setApp(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyApiKey = () => {
    if (app?.apiKey) {
      navigator.clipboard.writeText(app.apiKey);
      toast.success("API Key copied to clipboard");
    }
  };

  const handleRegenerateKey = async () => {
    if (!confirm("Are you sure? This will invalidate the current API key."))
      return;

    try {
      setIsRegeneratingKey(true);
      const token = localStorage.getItem("accessToken");
      const response = await fetch(
        `/api/v1/orgs/${id}/apps/${appId}/regenerate-key`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to regenerate key");
      }

      const result = await response.json();
      setApp(result.data);
      toast.success("API Key regenerated successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsRegeneratingKey(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Application not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{app.name}</h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            {app.slug}
          </p>
        </div>
        <Badge variant={app.status === "ACTIVE" ? "default" : "secondary"}>
          {app.status}
        </Badge>
      </div>
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="credentials" className="w-full">
          <TabsList>
            <TabsTrigger value="credentials">Credentials</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="credentials" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>API Credentials</CardTitle>
                <CardDescription>
                  Use these credentials to authenticate requests from your
                  application
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* API Key */}
                <div>
                  <Label className="text-base font-semibold mb-2 block">
                    API Key
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showApiKey ? "text" : "password"}
                        value={app.apiKey}
                        readOnly
                        className="font-mono text-sm"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyApiKey}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Include this key in your API requests as a Bearer token
                  </p>
                </div>

                <Separator />

                {/* Regenerate Key */}
                <div>
                  <h4 className="font-semibold mb-2">Key Management</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Regenerate your API key to invalidate the current one. Make
                    sure to update your application with the new key.
                  </p>
                  <Button
                    variant="destructive"
                    onClick={handleRegenerateKey}
                    disabled={isRegeneratingKey}
                  >
                    {isRegeneratingKey && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Regenerate API Key
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Application Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-sm font-semibold mb-2 block">
                    Name
                  </Label>
                  <Input value={app.name} readOnly className="bg-slate-50" />
                </div>

                <div>
                  <Label className="text-sm font-semibold mb-2 block">
                    Slug
                  </Label>
                  <Input
                    value={app.slug}
                    readOnly
                    className="font-mono text-sm bg-slate-50"
                  />
                </div>

                {app.description && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">
                      Description
                    </Label>
                    <Input
                      value={app.description}
                      readOnly
                      className="bg-slate-50"
                    />
                  </div>
                )}

                {app.allowedOrigins && app.allowedOrigins.length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">
                      Allowed Origins
                    </Label>
                    <div className="space-y-2">
                      {app.allowedOrigins.map((origin, idx) => (
                        <Input
                          key={idx}
                          value={origin}
                          readOnly
                          className="font-mono text-sm bg-slate-50"
                        />
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                <div>
                  <Label className="text-sm font-semibold mb-2 block">
                    Created
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {new Date(app.createdAt).toLocaleString()}
                  </p>
                </div>

                <Separator />

                <div>
                  <h4 className="font-semibold mb-2 text-red-600">
                    Danger Zone
                  </h4>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Application
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Application Users</CardTitle>
                <CardDescription>
                  Users who have access to this application
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <p>User management coming soon</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </div>
  );
}
