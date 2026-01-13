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
  Key,
  Shield,
  Check,
  UserPlus,
} from "lucide-react";
import { authFetch } from "@z0/utils/api/client";

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

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@z0/components/ui/alert-dialog";
import { AppMemberTable } from "@z0/app/components/applications";
import { AddAppMemberDialog, EditAppMemberRoleDialog, RemoveAppMemberDialog } from "@z0/app/components/applications";
import { useAuth } from "@z0/app/contexts/auth-context";

interface App {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
  allowedOrigins?: { id: string; origin: string }[];
  memberCount?: number;
}

interface AppMember {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  avatar?: string | null;
  roleType: "APP_OWNER" | "APP_MANAGER" | "APP_USER";
  joinedAt: string;
  externalId?: string | null;
  customScopes?: string[];
  status?: string;
}

export default function AppDetail() {
  const navigate = useNavigate();
  const { id, appId } = useParams<{ id: string; appId: string }>();
  const { user } = useAuth();
  const [app, setApp] = useState<App | null>(null);
  const [members, setMembers] = useState<AppMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // Secret regeneration state
  const [isRegeneratingSecret, setIsRegeneratingSecret] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [showNewSecretDialog, setShowNewSecretDialog] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);

  // Member management state
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isEditRoleOpen, setIsEditRoleOpen] = useState(false);
  const [isRemoveMemberOpen, setIsRemoveMemberOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<AppMember | null>(null);
  const [isMemberSubmitting, setIsMemberSubmitting] = useState(false);

  // Delete app state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (id && appId) {
      loadAppDetail();
      loadAppMembers();
    }
  }, [id, appId]);

  const loadAppDetail = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await authFetch(`/api/v1/orgs/${id}/apps/${appId}`);

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

  const loadAppMembers = async () => {
    try {
      const response = await authFetch(`/api/v1/orgs/${id}/apps/${appId}/members`);
      if (response.ok) {
        const result = await response.json();
        setMembers(result.data || []);
      }
    } catch (err) {
      console.error("Failed to load app members:", err);
    }
  };

  const handleCopyApiKey = () => {
    if (app?.apiKey) {
      navigator.clipboard.writeText(app.apiKey);
      toast.success("API Key copied to clipboard");
    }
  };

  const handleCopyNewSecret = async () => {
    if (newSecret) {
      await navigator.clipboard.writeText(newSecret);
      setSecretCopied(true);
      toast.success("Secret copied to clipboard");
      setTimeout(() => setSecretCopied(false), 2000);
    }
  };

  const handleRegenerateSecret = async () => {
    setShowRegenerateConfirm(false);
    try {
      setIsRegeneratingSecret(true);
      const response = await authFetch(
        `/api/v1/orgs/${id}/apps/${appId}/regenerate-secret`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error("Failed to regenerate secret");
      }

      const result = await response.json();
      setNewSecret(result.data.apiSecret);
      setShowNewSecretDialog(true);
      toast.success("API Secret regenerated successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsRegeneratingSecret(false);
    }
  };

  const handleDeleteApp = async () => {
    try {
      setIsDeleting(true);
      const response = await authFetch(`/api/v1/orgs/${id}/apps/${appId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete application");
      }

      toast.success("Application deleted");
      navigate(`/dashboard/organizations/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Member management handlers
  const handleAddMember = async (data: { email: string; roleType: string }) => {
    try {
      setIsMemberSubmitting(true);
      const response = await authFetch(`/api/v1/orgs/${id}/apps/${appId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Failed to add member");
      }

      setIsAddMemberOpen(false);
      await loadAppMembers();
      toast.success("Member added successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsMemberSubmitting(false);
    }
  };

  const handleEditMemberRole = async (data: { roleType: string }) => {
    if (!selectedMember) return;
    try {
      setIsMemberSubmitting(true);
      const response = await authFetch(
        `/api/v1/orgs/${id}/apps/${appId}/members/${selectedMember.userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Failed to update role");
      }

      setIsEditRoleOpen(false);
      setSelectedMember(null);
      await loadAppMembers();
      toast.success("Role updated successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsMemberSubmitting(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!selectedMember) return;
    try {
      setIsMemberSubmitting(true);
      const response = await authFetch(
        `/api/v1/orgs/${id}/apps/${appId}/members/${selectedMember.userId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Failed to remove member");
      }

      setIsRemoveMemberOpen(false);
      setSelectedMember(null);
      await loadAppMembers();
      toast.success("Member removed successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsMemberSubmitting(false);
    }
  };

  const openEditRoleDialog = (member: AppMember) => {
    setSelectedMember(member);
    setIsEditRoleOpen(true);
  };

  const openRemoveMemberDialog = (member: AppMember) => {
    setSelectedMember(member);
    setIsRemoveMemberOpen(true);
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
                {/* API Key - Public identifier */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-base font-semibold">API Key</Label>
                  </div>
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
                    Public identifier for your application. This key is permanent and cannot be changed.
                  </p>
                </div>

                <Separator />

                {/* API Secret Management */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <h4 className="font-semibold">API Secret</h4>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    The API secret is only shown once when created or regenerated.
                    If you've lost your secret, you can regenerate it here.
                    This will invalidate the previous secret immediately.
                  </p>
                  <Button
                    variant="destructive"
                    onClick={() => setShowRegenerateConfirm(true)}
                    disabled={isRegeneratingSecret}
                  >
                    {isRegeneratingSecret && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Regenerate API Secret
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
                      {app.allowedOrigins.map((origin) => (
                        <Input
                          key={origin.id}
                          value={origin.origin}
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
                  <p className="text-sm text-muted-foreground mb-4">
                    Deleting this application will deactivate it and revoke all API access.
                    This action cannot be undone.
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Application
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Application Users</CardTitle>
                  <CardDescription>
                    Users who have access to this application
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setIsAddMemberOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add User
                </Button>
              </CardHeader>
              <CardContent>
                {members.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No users have been added to this application yet.</p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => setIsAddMemberOpen(true)}
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add First User
                    </Button>
                  </div>
                ) : (
                  <AppMemberTable
                    data={members}
                    currentUserId={user?.id}
                    onEditRole={openEditRoleDialog}
                    onRemove={openRemoveMemberDialog}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Regenerate Secret Confirmation Dialog */}
        <AlertDialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Regenerate API Secret?</AlertDialogTitle>
              <AlertDialogDescription>
                This will immediately invalidate the current API secret.
                Any applications using the old secret will stop working.
                Make sure to update your applications with the new secret.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRegenerateSecret}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Regenerate Secret
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* New Secret Display Dialog */}
        <Dialog open={showNewSecretDialog} onOpenChange={setShowNewSecretDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                Save Your New API Secret
              </DialogTitle>
              <DialogDescription>
                This is the only time you'll see this secret. Copy it now and store it securely.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md font-mono text-sm break-all">
                <code className="flex-1">{newSecret}</code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyNewSecret}
                  className="shrink-0"
                >
                  {secretCopied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Store this secret in a secure location. You won't be able to see it again.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => {
                setShowNewSecretDialog(false);
                setNewSecret(null);
              }}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete App Confirmation Dialog */}
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Application?</AlertDialogTitle>
              <AlertDialogDescription>
                This will deactivate "{app.name}" and revoke all API access.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteApp}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete Application
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Add Member Dialog */}
        <AddAppMemberDialog
          open={isAddMemberOpen}
          onOpenChange={setIsAddMemberOpen}
          onSubmit={handleAddMember}
          isSubmitting={isMemberSubmitting}
        />

        {/* Edit Role Dialog */}
        <EditAppMemberRoleDialog
          open={isEditRoleOpen}
          onOpenChange={setIsEditRoleOpen}
          member={selectedMember}
          onSubmit={handleEditMemberRole}
          isSubmitting={isMemberSubmitting}
        />

        {/* Remove Member Dialog */}
        <RemoveAppMemberDialog
          open={isRemoveMemberOpen}
          onOpenChange={setIsRemoveMemberOpen}
          member={selectedMember}
          onConfirm={handleRemoveMember}
          isSubmitting={isMemberSubmitting}
        />
    </div>
  );
}
