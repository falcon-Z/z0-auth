import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2,
  Plus,
  AlertCircle,
  Key,
  MoreHorizontal,
  Edit2,
  Trash2,
  RefreshCw,
  Lock,
  Search,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@z0/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@z0/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";
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
import { Input } from "@z0/components/ui/input";
import { Textarea } from "@z0/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@z0/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@z0/components/ui/badge";
import { useOrg, useOrgPermissions } from "../../../contexts/org-context";

// Create/Edit scope schema
const scopeSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be 50 characters or less")
    .regex(/^[a-z0-9_]+$/, "Name must be lowercase letters, numbers, and underscores only"),
  description: z
    .string()
    .min(1, "Description is required")
    .max(500, "Description must be 500 characters or less"),
  category: z
    .string()
    .min(2, "Category must be at least 2 characters")
    .max(50, "Category must be 50 characters or less"),
});

type ScopeFormValues = z.infer<typeof scopeSchema>;

interface Scope {
  id: string;
  name: string;
  description: string;
  category: string;
  isSystem: boolean;
  usageCount: number;
  createdAt: string;
}

export default function ScopesPage() {
  const { currentOrg } = useOrg();
  const { canManageRoles } = useOrgPermissions();

  const [scopes, setScopes] = useState<Scope[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedScope, setSelectedScope] = useState<Scope | null>(null);

  const createForm = useForm<ScopeFormValues>({
    resolver: zodResolver(scopeSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
    },
  });

  const editForm = useForm<ScopeFormValues>({
    resolver: zodResolver(scopeSchema),
  });

  const loadScopes = useCallback(async () => {
    if (!currentOrg) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/v1/orgs/${currentOrg.id}/scopes`, {
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load scopes");
      }

      const result = await response.json();
      setScopes(result.scopes || result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    loadScopes();
  }, [loadScopes]);

  // Group scopes by category
  const groupedScopes = useMemo(() => {
    const filtered = scopes.filter(
      (scope) =>
        scope.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        scope.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        scope.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return filtered.reduce(
      (acc, scope) => {
        const category = scope.category || "uncategorized";
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(scope);
        return acc;
      },
      {} as Record<string, Scope[]>
    );
  }, [scopes, searchQuery]);

  const categories = Object.keys(groupedScopes).sort();

  const handleCreateScope = async (data: ScopeFormValues) => {
    if (!currentOrg) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(`/api/v1/orgs/${currentOrg.id}/scopes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create scope");
      }

      setIsCreateDialogOpen(false);
      createForm.reset();
      await loadScopes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditScope = async (data: ScopeFormValues) => {
    if (!currentOrg || !selectedScope) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(
        `/api/v1/orgs/${currentOrg.id}/scopes/${selectedScope.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update scope");
      }

      setIsEditDialogOpen(false);
      setSelectedScope(null);
      await loadScopes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteScope = async () => {
    if (!currentOrg || !selectedScope) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(
        `/api/v1/orgs/${currentOrg.id}/scopes/${selectedScope.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete scope");
      }

      setIsDeleteDialogOpen(false);
      setSelectedScope(null);
      await loadScopes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (scope: Scope) => {
    setSelectedScope(scope);
    editForm.reset({
      name: scope.name,
      description: scope.description,
      category: scope.category,
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (scope: Scope) => {
    setSelectedScope(scope);
    setIsDeleteDialogOpen(true);
  };

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">No organization selected</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Scopes</h1>
          <p className="text-muted-foreground mt-1">
            Manage permission scopes for {currentOrg.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadScopes} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canManageRoles && (
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Scope
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create a new scope</DialogTitle>
                  <DialogDescription>
                    Define a new permission scope for your organization
                  </DialogDescription>
                </DialogHeader>
                <Form {...createForm}>
                  <form
                    onSubmit={createForm.handleSubmit(handleCreateScope)}
                    className="space-y-4"
                  >
                    <FormField
                      control={createForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Scope name</FormLabel>
                          <FormControl>
                            <Input placeholder="read_reports" {...field} />
                          </FormControl>
                          <FormDescription>
                            Lowercase letters, numbers, and underscores only
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <FormControl>
                            <Input placeholder="analytics" {...field} />
                          </FormControl>
                          <FormDescription>
                            Group related scopes together
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe what this scope grants access to..."
                              className="resize-none"
                              rows={3}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsCreateDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Create Scope
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search scopes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : categories.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Key className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchQuery ? "No scopes found" : "No scopes yet"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery
                ? "Try a different search term"
                : "Create custom scopes to define fine-grained permissions"}
            </p>
            {!searchQuery && canManageRoles && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Scope
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {categories.map((category) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="capitalize">{category}</CardTitle>
                <CardDescription>
                  {groupedScopes[category].length} scope
                  {groupedScopes[category].length !== 1 ? "s" : ""} in this category
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scope</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Usage</TableHead>
                      {canManageRoles && (
                        <TableHead className="text-right">Actions</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedScopes[category].map((scope) => (
                      <TableRow key={scope.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="bg-muted px-2 py-1 rounded text-sm">
                              {scope.name}
                            </code>
                            {scope.isSystem && (
                              <Badge variant="secondary" className="gap-1">
                                <Lock className="h-3 w-3" />
                                System
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-md">
                          {scope.description}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{scope.usageCount} uses</Badge>
                        </TableCell>
                        {canManageRoles && (
                          <TableCell className="text-right">
                            {!scope.isSystem && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Open menu</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => openEditDialog(scope)}
                                  >
                                    <Edit2 className="mr-2 h-4 w-4" />
                                    Edit scope
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => openDeleteDialog(scope)}
                                    disabled={scope.usageCount > 0}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete scope
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Scope Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit scope</DialogTitle>
            <DialogDescription>Update the scope settings</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditScope)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scope name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea className="resize-none" rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scope</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the scope "{selectedScope?.name}"? This
              action cannot be undone.
              {selectedScope && selectedScope.usageCount > 0 && (
                <span className="block mt-2 text-destructive">
                  This scope is used {selectedScope.usageCount} times. Remove all usages
                  before deleting.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteScope}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={selectedScope?.usageCount ? selectedScope.usageCount > 0 : false}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Scope
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
