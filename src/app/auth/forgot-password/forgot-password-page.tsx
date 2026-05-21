import { AuthLayout } from "../components/auth-layout";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@z0/components/ui/card";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";

export function ForgotPasswordPage() {
  return (
    <AuthLayout title="Reset password" description="We will email you a reset link">
      <Card>
        <CardHeader>
          <CardTitle>Forgot password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" />
          </div>
          <Button className="w-full" type="button" disabled>
            Send reset link (coming soon)
          </Button>
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground">
          <a href="/login" className="hover:text-foreground">
            Back to sign in
          </a>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}
