/**
 * Application form component
 * Reusable form for create/edit operations with auto-slug generation
 */

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@z0/components/ui/form";
import { Input } from "@z0/components/ui/input";
import { Textarea } from "@z0/components/ui/textarea";
import { createAppFormSchema, type CreateAppFormInput } from "@z0/validation";
import type { AppWithCounts } from "@z0/types";

interface AppFormProps {
  /** Form mode */
  mode: "create" | "edit";
  /** Initial values for edit mode */
  initialValues?: AppWithCounts;
  /** Submit handler */
  onSubmit: (data: CreateAppFormInput) => void | Promise<void>;
  /** Loading state */
  isSubmitting?: boolean;
  /** Form ID for external submit button */
  formId?: string;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

export function AppForm({
  mode,
  initialValues,
  onSubmit,
  isSubmitting = false,
  formId = "app-form",
}: AppFormProps) {
  const form = useForm<CreateAppFormInput>({
    resolver: zodResolver(createAppFormSchema),
    defaultValues: {
      name: initialValues?.name ?? "",
      slug: initialValues?.slug ?? "",
      description: initialValues?.description ?? "",
      allowedOrigins: "", // TODO: Handle existing origins in edit mode
    },
  });

  const watchName = form.watch("name");
  const currentSlug = form.watch("slug");

  // Auto-generate slug from name in create mode
  useEffect(() => {
    if (mode === "create" && watchName && !currentSlug) {
      const generatedSlug = generateSlug(watchName);
      form.setValue("slug", generatedSlug, { shouldValidate: true });
    }
  }, [watchName, mode, form, currentSlug]);

  const handleSubmit = async (data: CreateAppFormInput) => {
    await onSubmit(data);
  };

  return (
    <Form {...form}>
      <form
        id={formId}
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-4"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="My Application"
                  {...field}
                  disabled={isSubmitting}
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
                  placeholder="my-application"
                  {...field}
                  disabled={isSubmitting || mode === "edit"}
                />
              </FormControl>
              <FormDescription>
                {mode === "create"
                  ? "URL-friendly identifier. Auto-generated from name."
                  : "Cannot be changed after creation."}
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
                  placeholder="Brief description of your application..."
                  className="resize-none"
                  rows={3}
                  {...field}
                  value={field.value ?? ""}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="allowedOrigins"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Allowed Origins</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://example.com, https://app.example.com"
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormDescription>
                Comma-separated list of URLs allowed to make API requests (CORS).
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}

export type { AppFormProps };
