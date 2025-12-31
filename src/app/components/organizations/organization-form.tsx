/**
 * OrganizationForm component
 * Reusable form for creating/editing organizations
 */

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@z0/components/ui/form";
import { Input } from "@z0/components/ui/input";
import { Textarea } from "@z0/components/ui/textarea";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
} from "@z0/validation";
import type { OrganizationWithCounts } from "@z0/types";

interface OrganizationFormProps {
  /** Form mode - create or edit */
  mode: "create" | "edit";
  /** Initial values for edit mode */
  initialValues?: OrganizationWithCounts;
  /** Form submission handler */
  onSubmit: (data: CreateOrganizationInput | UpdateOrganizationInput) => void;
  /** Whether form is submitting */
  isSubmitting?: boolean;
  /** Form ID for external submit button */
  formId?: string;
}

export function OrganizationForm({
  mode,
  initialValues,
  onSubmit,
  isSubmitting = false,
  formId = "organization-form",
}: OrganizationFormProps) {
  const isEdit = mode === "edit";

  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(
      isEdit ? updateOrganizationSchema : createOrganizationSchema
    ),
    defaultValues: {
      name: initialValues?.name ?? "",
      slug: initialValues?.slug ?? "",
      description: initialValues?.description ?? "",
      maxUsers: initialValues?.maxUsers ?? undefined,
      maxApps: initialValues?.maxApps ?? undefined,
    },
  });

  // Reset form when initialValues change (for edit mode)
  useEffect(() => {
    if (initialValues) {
      form.reset({
        name: initialValues.name,
        slug: initialValues.slug,
        description: initialValues.description ?? "",
        maxUsers: initialValues.maxUsers ?? undefined,
        maxApps: initialValues.maxApps ?? undefined,
      });
    }
  }, [initialValues, form]);

  // Auto-generate slug from name (only in create mode)
  const watchName = form.watch("name");
  useEffect(() => {
    if (!isEdit && watchName && !form.formState.dirtyFields.slug) {
      const slug = watchName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      form.setValue("slug", slug);
    }
  }, [watchName, isEdit, form]);

  const handleSubmit = form.handleSubmit((data) => {
    onSubmit(data);
  });

  return (
    <Form {...form}>
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Acme Corporation"
                  disabled={isSubmitting}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <Input
                  placeholder="acme-corp"
                  disabled={isSubmitting}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                URL-friendly identifier (lowercase, numbers, dashes only)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Brief description of the organization..."
                  disabled={isSubmitting}
                  rows={3}
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="maxUsers"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Users</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="Unlimited"
                    disabled={isSubmitting}
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value ? parseInt(e.target.value, 10) : undefined
                      )
                    }
                  />
                </FormControl>
                <FormDescription>Leave empty for unlimited</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maxApps"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Apps</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="Unlimited"
                    disabled={isSubmitting}
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value ? parseInt(e.target.value, 10) : undefined
                      )
                    }
                  />
                </FormControl>
                <FormDescription>Leave empty for unlimited</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </form>
    </Form>
  );
}

export type { OrganizationFormProps };
