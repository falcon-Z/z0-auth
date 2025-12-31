/**
 * Application dialogs
 * Create, edit, and delete dialogs for applications
 */

import { FormDialog, DeleteConfirmDialog, SingleSecretDialog } from "@z0/app/components/shared";
import { AppForm } from "./app-form";
import type { AppWithCounts, CreateAppResponse } from "@z0/types";
import type { CreateAppFormInput } from "@z0/validation";

interface CreateAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateAppFormInput) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function CreateAppDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
}: CreateAppDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create Application"
      description="Add a new application to your organization."
      onSubmit={(e) => e.preventDefault()}
      isSubmitting={isSubmitting}
      hideFooter
    >
      <AppForm
        mode="create"
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        formId="create-app-form"
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
          form="create-app-form"
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create"}
        </button>
      </div>
    </FormDialog>
  );
}

interface EditAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  app: AppWithCounts | null;
  onSubmit: (data: CreateAppFormInput) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function EditAppDialog({
  open,
  onOpenChange,
  app,
  onSubmit,
  isSubmitting = false,
}: EditAppDialogProps) {
  if (!app) return null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Application"
      description={`Update settings for ${app.name}`}
      onSubmit={(e) => e.preventDefault()}
      isSubmitting={isSubmitting}
      hideFooter
    >
      <AppForm
        mode="edit"
        initialValues={app}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        formId="edit-app-form"
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
          form="edit-app-form"
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Saving..." : "Save"}
        </button>
      </div>
    </FormDialog>
  );
}

interface DeleteAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  app: AppWithCounts | null;
  onConfirm: () => void | Promise<void>;
  isSubmitting?: boolean;
}

export function DeleteAppDialog({
  open,
  onOpenChange,
  app,
  onConfirm,
  isSubmitting = false,
}: DeleteAppDialogProps) {
  return (
    <DeleteConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      itemType="application"
      itemName={app?.name}
      onConfirm={onConfirm}
      isLoading={isSubmitting}
    />
  );
}

interface AppSecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appData: CreateAppResponse | null;
}

export function AppSecretDialog({
  open,
  onOpenChange,
  appData,
}: AppSecretDialogProps) {
  return (
    <SingleSecretDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Application Created"
      description="Your application has been created. Save the API secret - it won't be shown again."
      secretLabel="API Secret"
      secretValue={appData?.apiSecret ?? ""}
      additionalInfo={
        appData
          ? [
              { label: "App Name", value: appData.app.name },
              { label: "API Key", value: appData.apiKey },
            ]
          : undefined
      }
    />
  );
}

export type {
  CreateAppDialogProps,
  EditAppDialogProps,
  DeleteAppDialogProps,
  AppSecretDialogProps,
};
