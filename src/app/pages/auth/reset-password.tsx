import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";

import { Button } from "@z0/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@z0/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@z0/components/ui/form";
import { Alert, AlertDescription } from "@z0/components/ui/alert";
import { PasswordInput } from "@z0/components/ui/password-input";

const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

type PageStatus = "validating" | "ready" | "success" | "expired" | "used" | "invalid";

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

  const renderContent = () => {
    switch (status) {
      case "validating":
        return (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Validating reset link...</p>
          </div>
        );

      case "success":
        return (
          <div className="flex flex-col items-center py-8">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Password Reset!</h3>
            <p className="text-muted-foreground text-center mb-6">
              Your password has been reset successfully. You can now log in with your new password.
            </p>
            <Button onClick={() => navigate("/login")}>
              Continue to Login
            </Button>
          </div>
        );

      case "expired":
        return (
          <div className="flex flex-col items-center py-8">
            <XCircle className="h-12 w-12 text-yellow-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Link Expired</h3>
            <p className="text-muted-foreground text-center mb-6">
              This password reset link has expired. Please request a new one.
            </p>
            <Link to="/auth/forgot-password">
              <Button>Request New Link</Button>
            </Link>
          </div>
        );

      case "used":
        return (
          <div className="flex flex-col items-center py-8">
            <CheckCircle2 className="h-12 w-12 text-blue-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Already Used</h3>
            <p className="text-muted-foreground text-center mb-6">
              This password reset link has already been used. If you need to reset your password again, please request a new link.
            </p>
            <div className="space-y-2">
              <Button onClick={() => navigate("/login")} className="w-full">
                Go to Login
              </Button>
              <Link to="/auth/forgot-password" className="block">
                <Button variant="outline" className="w-full">
                  Request New Link
                </Button>
              </Link>
            </div>
          </div>
        );

      case "invalid":
        return (
          <div className="flex flex-col items-center py-8">
            <XCircle className="h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Invalid Link</h3>
            <p className="text-muted-foreground text-center mb-6">
              This password reset link is invalid. Please request a new one.
            </p>
            <Link to="/auth/forgot-password">
              <Button>Request New Link</Button>
            </Link>
          </div>
        );

      case "ready":
      default:
        return (
          <>
            {error && (
              <Alert variant="destructive" className="mb-4">
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
                        <PasswordInput
                          placeholder="Enter your new password"
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
                        <PasswordInput
                          placeholder="Confirm your new password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="text-sm text-muted-foreground">
                  Password must:
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Be at least 8 characters long</li>
                    <li>Contain at least one uppercase letter</li>
                    <li>Contain at least one lowercase letter</li>
                    <li>Contain at least one number</li>
                  </ul>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Reset Password
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="text-sm text-muted-foreground hover:text-primary"
              >
                <ArrowLeft className="inline mr-1 h-4 w-4" />
                Back to Login
              </Link>
            </div>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-bold text-center">
            Reset Password
          </CardTitle>
          {status === "ready" && (
            <CardDescription className="text-center">
              Enter your new password below.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>{renderContent()}</CardContent>
      </Card>
    </div>
  );
}
