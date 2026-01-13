/**
 * Organization dialogs
 * Create, edit, and delete dialogs for organizations
 */

import { FormDialog, DeleteConfirmDialog } from "@z0/app/components/shared";
import { OrganizationForm } from "./organization-form";
import type { OrganizationWithCounts, CreateOrganizationInput, UpdateOrganizationInput } from "@z0/types";

interface CreateOrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateOrganizationInput) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function CreateOrganizationDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
}: CreateOrganizationDialogProps) {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The form handles its own submission via form ID
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create Organization"
      description="Add a new organization to the platform."
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Create"
      hideFooter
    >
      <OrganizationForm
        mode="create"
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        formId="create-org-form"
      />
      <div className="flex justify-end gap-2 pt-4">
        <button
          type="button"
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
          onClick={() => onOpenChange(false)}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          form="create-org-form"
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create"}
        </button>
      </div>
    </FormDialog>
  );
}

interface EditOrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: OrganizationWithCounts | null;
  onSubmit: (data: UpdateOrganizationInput) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function EditOrganizationDialog({
  open,
  onOpenChange,
  organization,
  onSubmit,
  isSubmitting = false,
}: EditOrganizationDialogProps) {
  if (!organization) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Organization"
      description={`Update settings for ${organization.name}`}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Save"
      hideFooter
    >
      <OrganizationForm
        mode="edit"
        initialValues={organization}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        formId="edit-org-form"
      />
      <div className="flex justify-end gap-2 pt-4">
        <button
          type="button"
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
          onClick={() => onOpenChange(false)}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          form="edit-org-form"
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Saving..." : "Save"}
        </button>
      </div>
    </FormDialog>
  );
}

interface DeleteOrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: OrganizationWithCounts | null;
  onConfirm: () => void | Promise<void>;
  isSubmitting?: boolean;
}

export function DeleteOrganizationDialog({
  open,
  onOpenChange,
  organization,
  onConfirm,
  isSubmitting = false,
}: DeleteOrganizationDialogProps) {
  return (
    <DeleteConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      itemType="organization"
      itemName={organization?.name}
      onConfirm={onConfirm}
      isLoading={isSubmitting}
    />
  );
}

export type {
  CreateOrganizationDialogProps,
  EditOrganizationDialogProps,
  DeleteOrganizationDialogProps,
};
