import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, CheckCircle2, AlertCircle, KeyRound } from "lucide-react";

import { PublicLayout } from "../../components/layout/public-layout";
import { Button } from "@z0/components/ui/button";
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
import { Alert, AlertDescription } from "@z0/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@z0/components/ui/card";
import { authFetch } from "@z0/utils/api/client";
import { useAuth } from "@z0/app/contexts/auth-context";

const firstTimeSetupSchema = z
  .object({
    currentPassword: z.string().min(1, "Temporary password is required"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    name: z.string().max(100).optional(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type FirstTimeSetupFormValues = z.infer<typeof firstTimeSetupSchema>;

type PageStatus = "loading" | "ready" | "success" | "not-required" | "error";

export default function FirstTimeSetup() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  const [status, setStatus] = useState<PageStatus>("loading");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{ email: string; name: string } | null>(null);

  const form = useForm<FirstTimeSetupFormValues>({
    resolver: zodResolver(firstTimeSetupSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      name: "",
    },
  });

  // Check if user needs first-time setup
  useEffect(() => {
    const checkSetupStatus = async () => {
      try {
        const response = await authFetch("/api/v1/users/setup-status");

        if (!response.ok) {
          if (response.status === 401) {
            // Not logged in, redirect to login
            navigate("/login");
            return;
          }
          throw new Error("Failed to check setup status");
        }

        const result = await response.json();

        if (result.data.requiresPasswordChange) {
          setUserInfo({
            email: result.data.email,
            name: result.data.name,
          });
          form.setValue("name", result.data.name || "");
          setStatus("ready");
        } else {
          setStatus("not-required");
          // Redirect to dashboard after short delay
          setTimeout(() => {
            navigate("/dashboard");
          }, 2000);
        }
      } catch (err) {
        console.error("Setup status check failed:", err);
        setStatus("error");
        setError("Failed to load setup page. Please try again.");
      }
    };

    checkSetupStatus();
  }, [navigate, form]);

  const onSubmit = async (data: FirstTimeSetupFormValues) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await authFetch("/api/v1/users/first-time-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
          confirmPassword: data.confirmPassword,
          name: data.name || undefined,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setStatus("success");
        // Refresh user data in context
        refreshUser();
        // Redirect to dashboard after short delay
        setTimeout(() => {
          navigate("/dashboard");
        }, 2000);
      } else {
        if (response.status === 403) {
          setError("Incorrect temporary password. Please check and try again.");
        } else if (result.errors?.[0]?.message) {
          setError(result.errors[0].message);
        } else {
          setError(result.message || "Failed to complete setup");
        }
      }
    } catch (err) {
      console.error("Setup submission failed:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (status === "loading") {
    return (
      <PublicLayout showLogo={true}>
        <div className="flex flex-col items-center py-8 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </PublicLayout>
    );
  }

  // Not required state
  if (status === "not-required") {
    return (
      <PublicLayout showLogo={true}>
        <Card className="w-full max-w-md mx-auto">
          <CardContent className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Already Set Up</h2>
            <p className="text-sm text-muted-foreground">
              Your account is already configured. Redirecting to dashboard...
            </p>
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  // Success state
  if (status === "success") {
    return (
      <PublicLayout showLogo={true}>
        <Card className="w-full max-w-md mx-auto">
          <CardContent className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Setup Complete!</h2>
            <p className="text-sm text-muted-foreground">
              Your account has been set up successfully. Redirecting to dashboard...
            </p>
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <PublicLayout showLogo={true}>
        <Card className="w-full max-w-md mx-auto">
          <CardContent className="flex flex-col items-center py-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Something Went Wrong</h2>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  // Ready state - show the form
  return (
    <PublicLayout showLogo={true}>
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Set Up Your Account</CardTitle>
          <CardDescription>
            Welcome! Please set a new password to secure your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {userInfo && (
            <div className="mb-6 p-3 rounded-lg bg-muted/50 text-center">
              <p className="text-sm text-muted-foreground">Logged in as</p>
              <p className="font-medium">{userInfo.email}</p>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temporary Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Enter your temporary password"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      The password provided by your administrator
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Create a strong password"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Must be at least 8 characters with uppercase, lowercase, and number
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Confirm your new password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Your name" {...field} />
                    </FormControl>
                    <FormDescription>
                      Update your display name if needed
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Complete Setup
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </PublicLayout>
  );
}
