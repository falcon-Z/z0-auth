import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { Loader2, CheckCircle, XCircle, AlertCircle, Mail } from "lucide-react";

import { PublicLayout } from "../../components/layout/public-layout";
import { Button } from "@z0/components/ui/button";
import { Alert, AlertDescription } from "@z0/components/ui/alert";
import { Badge } from "@z0/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@z0/components/ui/card";

interface InvitationDetails {
  id: string;
  email: string;
  organizationName: string;
  organizationSlug: string;
  roleType: string;
  invitedByName: string;
  invitedByEmail: string;
  message?: string;
  expiresAt: string;
}

interface StoredUser {
  id: string;
  email: string;
  name: string;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    roleType: string;
    isDefault: boolean;
  }>;
}

function getStoredUser(): StoredUser | null {
  try {
    const userStr = localStorage.getItem("user");
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
}

function getRoleLabel(roleType: string): string {
  switch (roleType) {
    case "ORG_OWNER":
      return "Owner";
    case "ORG_ADMIN":
      return "Admin";
    case "ORG_DEVELOPER":
      return "Developer";
    case "ORG_MEMBER":
      return "Member";
    default:
      return roleType;
  }
}

type PageState =
  | "loading"
  | "ready"
  | "accepting"
  | "declining"
  | "success"
  | "declined"
  | "error"
  | "expired"
  | "already-member"
  | "wrong-email"
  | "not-logged-in";

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<PageState>("loading");
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user] = useState(() => getStoredUser());

  useEffect(() => {
    if (!token) {
      setState("error");
      setError("Invalid invitation link");
      return;
    }

    validateInvitation();
  }, [token]);

  const validateInvitation = async () => {
    try {
      const response = await fetch(`/api/auth/accept-invite/${token}`, {
        method: "GET",
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 410 || data.code === "EXPIRED") {
          setState("expired");
          return;
        }
        if (data.code === "ALREADY_MEMBER") {
          setState("already-member");
          setInvitation(data.invitation);
          return;
        }
        throw new Error(data.message || "Failed to validate invitation");
      }

      setInvitation(data.invitation);

      // Check if user is logged in
      if (!user) {
        setState("not-logged-in");
        return;
      }

      // Check if email matches
      if (user.email.toLowerCase() !== data.invitation.email.toLowerCase()) {
        setState("wrong-email");
        return;
      }

      setState("ready");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Failed to validate invitation");
    }
  };

  const handleAccept = async () => {
    if (!token) return;

    setState("accepting");
    try {
      const response = await fetch(`/api/auth/accept-invite/${token}/accept`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to accept invitation");
      }

      // Update user in localStorage with new organization
      if (user && invitation) {
        const updatedUser = {
          ...user,
          organizations: [
            ...user.organizations,
            {
              id: data.organizationId,
              name: invitation.organizationName,
              slug: invitation.organizationSlug,
              roleType: invitation.roleType,
              isDefault: false,
            },
          ],
        };
        localStorage.setItem("user", JSON.stringify(updatedUser));
      }

      setState("success");

      // Redirect to the new organization after a brief delay
      setTimeout(() => {
        if (invitation) {
          navigate(`/org/${invitation.organizationSlug}/dashboard`);
        }
      }, 2000);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Failed to accept invitation");
    }
  };

  const handleDecline = async () => {
    if (!token) return;

    setState("declining");
    try {
      const response = await fetch(`/api/auth/accept-invite/${token}/decline`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to decline invitation");
      }

      setState("declined");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Failed to decline invitation");
    }
  };

  // Loading state
  if (state === "loading") {
    return (
      <PublicLayout title="Validating Invitation" description="Please wait...">
        <div className="flex flex-col items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Validating your invitation...</p>
        </div>
      </PublicLayout>
    );
  }

  // Expired state
  if (state === "expired") {
    return (
      <PublicLayout title="Invitation Expired" description="">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            This invitation has expired. Please ask the organization admin to send a new invitation.
          </AlertDescription>
        </Alert>
        <div className="mt-6 text-center">
          <Link to="/login" className="text-primary hover:underline">
            Go to Login
          </Link>
        </div>
      </PublicLayout>
    );
  }

  // Already a member
  if (state === "already-member" && invitation) {
    return (
      <PublicLayout title="Already a Member" description="">
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            You are already a member of {invitation.organizationName}.
          </AlertDescription>
        </Alert>
        <div className="mt-6 text-center">
          <Button asChild>
            <Link to={`/org/${invitation.organizationSlug}/dashboard`}>
              Go to {invitation.organizationName}
            </Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  // Not logged in
  if (state === "not-logged-in" && invitation) {
    return (
      <PublicLayout
        title="Sign in to Accept"
        description={`You've been invited to join ${invitation.organizationName}`}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Invitation from {invitation.organizationName}
            </CardTitle>
            <CardDescription>
              {invitation.invitedByName} has invited you to join as{" "}
              <Badge variant="secondary" className="ml-1">
                {getRoleLabel(invitation.roleType)}
              </Badge>
            </CardDescription>
          </CardHeader>
          {invitation.message && (
            <CardContent>
              <p className="text-sm text-muted-foreground italic">
                "{invitation.message}"
              </p>
            </CardContent>
          )}
          <CardFooter className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground text-center">
              Please sign in with <strong>{invitation.email}</strong> to accept this invitation.
            </p>
            <Button asChild className="w-full">
              <Link to={`/login?redirect=/accept-invite/${token}`}>
                Sign In
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </PublicLayout>
    );
  }

  // Wrong email
  if (state === "wrong-email" && invitation) {
    return (
      <PublicLayout title="Email Mismatch" description="">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This invitation was sent to <strong>{invitation.email}</strong>, but you are signed in as{" "}
            <strong>{user?.email}</strong>.
            <br />
            Please sign in with the correct account.
          </AlertDescription>
        </Alert>
        <div className="mt-6 flex flex-col gap-3">
          <Button
            variant="outline"
            onClick={() => {
              localStorage.removeItem("user");
              window.location.href = `/login?redirect=/accept-invite/${token}`;
            }}
          >
            Sign in with different account
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <PublicLayout title="Error" description="">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error || "An error occurred"}</AlertDescription>
        </Alert>
        <div className="mt-6 text-center">
          <Link to="/login" className="text-primary hover:underline">
            Go to Login
          </Link>
        </div>
      </PublicLayout>
    );
  }

  // Success state
  if (state === "success" && invitation) {
    return (
      <PublicLayout title="Welcome!" description="">
        <div className="flex flex-col items-center py-8">
          <CheckCircle className="h-12 w-12 text-green-500" />
          <h2 className="mt-4 text-xl font-semibold">
            You've joined {invitation.organizationName}!
          </h2>
          <p className="mt-2 text-muted-foreground">
            Redirecting to your new organization...
          </p>
          <Loader2 className="mt-4 h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </PublicLayout>
    );
  }

  // Declined state
  if (state === "declined") {
    return (
      <PublicLayout title="Invitation Declined" description="">
        <div className="flex flex-col items-center py-8">
          <XCircle className="h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">Invitation Declined</h2>
          <p className="mt-2 text-muted-foreground">
            You have declined this invitation.
          </p>
          <Button asChild className="mt-6">
            <Link to="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  // Ready state - show accept/decline options
  if (state === "ready" && invitation) {
    return (
      <PublicLayout
        title="You're Invited!"
        description={`Join ${invitation.organizationName}`}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Invitation from {invitation.organizationName}
            </CardTitle>
            <CardDescription>
              {invitation.invitedByName} ({invitation.invitedByEmail}) has invited you to join as{" "}
              <Badge variant="secondary" className="ml-1">
                {getRoleLabel(invitation.roleType)}
              </Badge>
            </CardDescription>
          </CardHeader>
          {invitation.message && (
            <CardContent>
              <p className="text-sm text-muted-foreground italic">
                "{invitation.message}"
              </p>
            </CardContent>
          )}
          <CardFooter className="flex gap-3">
            <Button
              onClick={handleAccept}
              disabled={state === "accepting" || state === "declining"}
              className="flex-1"
            >
              {state === "accepting" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Accept Invitation
            </Button>
            <Button
              variant="outline"
              onClick={handleDecline}
              disabled={state === "accepting" || state === "declining"}
            >
              {state === "declining" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Decline
            </Button>
          </CardFooter>
        </Card>
      </PublicLayout>
    );
  }

  // Fallback
  return null;
}
