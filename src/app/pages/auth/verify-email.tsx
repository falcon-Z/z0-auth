import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router";
import { Loader2, CheckCircle2, XCircle, Mail } from "lucide-react";

import { Button } from "@z0/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@z0/components/ui/card";
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
        setMessage(data.message || "Your email has been verified successfully!");
      } else {
        if (data.code === "TOKEN_EXPIRED") {
          setStatus("expired");
          setMessage(data.message || "This verification link has expired.");
        } else if (data.code === "TOKEN_ALREADY_USED") {
          setStatus("used");
          setMessage(data.message || "This verification link has already been used.");
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

  const renderContent = () => {
    switch (status) {
      case "loading":
        return (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Verifying your email...</p>
          </div>
        );

      case "success":
        return (
          <div className="flex flex-col items-center py-8">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Email Verified!</h3>
            <p className="text-muted-foreground text-center mb-6">{message}</p>
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
            <p className="text-muted-foreground text-center mb-6">{message}</p>
            <div className="space-y-2">
              <Button onClick={() => navigate("/login")} className="w-full">
                Go to Login
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                You can request a new verification email after logging in.
              </p>
            </div>
          </div>
        );

      case "used":
        return (
          <div className="flex flex-col items-center py-8">
            <Mail className="h-12 w-12 text-blue-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Already Verified</h3>
            <p className="text-muted-foreground text-center mb-6">{message}</p>
            <Button onClick={() => navigate("/login")}>
              Continue to Login
            </Button>
          </div>
        );

      case "error":
      default:
        return (
          <div className="flex flex-col items-center py-8">
            <XCircle className="h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Verification Failed</h3>
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
            <Button onClick={() => navigate("/login")}>
              Go to Login
            </Button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-bold text-center">
            Email Verification
          </CardTitle>
          <CardDescription className="text-center">
            Z0 Auth - Secure authentication platform
          </CardDescription>
        </CardHeader>
        <CardContent>{renderContent()}</CardContent>
      </Card>
    </div>
  );
}
