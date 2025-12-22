import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { Loader2, CheckCircle2, XCircle, Mail } from "lucide-react";

import { PublicLayout } from "../../components/layout/public-layout";
import { Button } from "@z0/components/ui/button";
import { Alert, AlertDescription } from "@z0/components/ui/alert";

type VerificationStatus = "loading" | "success" | "error" | "expired" | "used";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<VerificationStatus>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid verification link. No token provided.");
      return;
    }

    verifyToken(token);
  }, [token]);

  const verifyToken = async (token: string) => {
    try {
      const response = await fetch(`/api/auth/verify-email/${token}`, {
        method: "POST",
        credentials: "include",
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatus("success");
        setMessage(
          data.message || "Your email has been verified successfully!"
        );
      } else {
        if (data.code === "TOKEN_EXPIRED") {
          setStatus("expired");
          setMessage(data.message || "This verification link has expired.");
        } else if (data.code === "TOKEN_ALREADY_USED") {
          setStatus("used");
          setMessage(
            data.message || "This verification link has already been used."
          );
        } else {
          setStatus("error");
          setMessage(data.message || "Failed to verify email.");
        }
      }
    } catch {
      setStatus("error");
      setMessage("An error occurred while verifying your email.");
    }
  };

  // Loading state
  if (status === "loading") {
    return (
      <PublicLayout showLogo={true}>
        <div className="flex flex-col items-center py-8 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">
            Verifying your email...
          </p>
        </div>
      </PublicLayout>
    );
  }

  // Success state
  if (status === "success") {
    return (
      <PublicLayout title="Email verified!">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-green-100 dark:bg-green-900/20 p-3">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{message}</p>
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
            <p className="text-sm text-muted-foreground">{message}</p>
            <p className="text-xs text-muted-foreground">
              You can request a new verification email after logging in.
            </p>
          </div>

          <div className="pt-4">
            <Button onClick={() => navigate("/login")} className="w-full">
              Go to login
            </Button>
          </div>
        </div>
      </PublicLayout>
    );
  }

  // Used/Already verified state
  if (status === "used") {
    return (
      <PublicLayout title="Already verified">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/20 p-3">
              <Mail className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{message}</p>
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

  // Error state
  return (
    <PublicLayout title="Verification failed">
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="rounded-full bg-red-100 dark:bg-red-900/20 p-3">
            <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
        </div>

        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>

        <div className="pt-4">
          <Button onClick={() => navigate("/login")} className="w-full">
            Go to login
          </Button>
        </div>
      </div>
    </PublicLayout>
  );
}
