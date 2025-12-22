import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, CheckCircle2, XCircle, AlertCircle, ArrowLeft } from "lucide-react";

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
} from "@z0/components/ui/form";
import { Alert, AlertDescription } from "@z0/components/ui/alert";

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

type PageStatus =
  | "validating"
  | "ready"
  | "success"
  | "expired"
  | "used"
  | "invalid";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<PageStatus>("validating");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    validateToken(token);
  }, [token]);

  const validateToken = async (token: string) => {
    try {
      const response = await fetch(`/api/auth/reset-password/${token}`);
      const data = await response.json();

      if (data.valid) {
        setStatus("ready");
      } else {
        if (data.code === "TOKEN_EXPIRED") {
          setStatus("expired");
        } else if (data.code === "TOKEN_ALREADY_USED") {
          setStatus("used");
        } else {
          setStatus("invalid");
        }
      }
    } catch {
      setStatus("invalid");
    }
  };

  const onSubmit = async (data: ResetPasswordFormValues) => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          password: data.password,
          confirmPassword: data.confirmPassword,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setStatus("success");
        // Auto-redirect after 3 seconds
        setTimeout(() => navigate("/login"), 3000);
      } else {
        if (result.code === "TOKEN_EXPIRED") {
          setStatus("expired");
        } else if (result.code === "TOKEN_ALREADY_USED") {
          setStatus("used");
        } else {
          setError(result.message || "Failed to reset password");
        }
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Validating state
  if (status === "validating") {
    return (
      <PublicLayout showLogo={true}>
        <div className="flex flex-col items-center py-8 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">
            Validating reset link...
          </p>
        </div>
      </PublicLayout>
    );
  }

  // Success state
  if (status === "success") {
    return (
      <PublicLayout title="Password reset!">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-green-100 dark:bg-green-900/20 p-3">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Your password has been reset successfully.
            </p>
            <p className="text-sm text-muted-foreground">
              You can now log in with your new password.
            </p>
          </div>

          <div className="pt-4">
            <Button onClick={() => navigate("/login")} className="w-full">
              Continue to login
            </Button>
          </div>
        </div>
      </PublicLayout>
    );
  }

  // Expired state
  if (status === "expired") {
    return (
      <PublicLayout title="Link expired">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-yellow-100 dark:bg-yellow-900/20 p-3">
              <XCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              This password reset link has expired.
            </p>
            <p className="text-sm text-muted-foreground">
              Please request a new one.
            </p>
          </div>

          <div className="pt-4">
            <Link to="/auth/forgot-password">
              <Button className="w-full">Request new link</Button>
            </Link>
          </div>
        </div>
      </PublicLayout>
    );
  }

  // Used state
  if (status === "used") {
    return (
      <PublicLayout title="Already used">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/20 p-3">
              <CheckCircle2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              This password reset link has already been used.
            </p>
            <p className="text-sm text-muted-foreground">
              If you need to reset your password again, please request a new
              link.
            </p>
          </div>

          <div className="pt-4 space-y-2">
            <Button onClick={() => navigate("/login")} className="w-full">
              Go to login
            </Button>
            <Link to="/auth/forgot-password">
              <Button variant="outline" className="w-full">
                Request new link
              </Button>
            </Link>
          </div>
        </div>
      </PublicLayout>
    );
  }

  // Invalid state
  if (status === "invalid") {
    return (
      <PublicLayout title="Invalid link">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-red-100 dark:bg-red-900/20 p-3">
              <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              This password reset link is invalid.
            </p>
            <p className="text-sm text-muted-foreground">
              Please request a new one.
            </p>
          </div>

          <div className="pt-4">
            <Link to="/auth/forgot-password">
              <Button className="w-full">Request new link</Button>
            </Link>
          </div>
        </div>
      </PublicLayout>
    );
  }

  // Ready state - show form
  return (
    <PublicLayout
      title="Reset your password"
      description="Enter your new password below"
    >
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Enter your new password"
                    autoComplete="new-password"
                    {...field}
                  />
                </FormControl>
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
                    autoComplete="new-password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="rounded-lg bg-muted p-3">
            <p className="text-sm font-medium mb-2">Password must contain:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• At least 8 characters</li>
              <li>• One uppercase letter</li>
              <li>• One lowercase letter</li>
              <li>• One number</li>
            </ul>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reset password
          </Button>
        </form>
      </Form>

      <div className="mt-6 text-center">
        <Link
          to="/login"
          className="text-sm text-muted-foreground hover:text-primary inline-flex items-center"
        >
          <ArrowLeft className="mr-2 h-3 w-3" />
          Back to login
        </Link>
      </div>
    </PublicLayout>
  );
}
