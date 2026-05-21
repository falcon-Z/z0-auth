import { AuthLayout } from "../components/auth-layout";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@z0/components/ui/card";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";

export function RegisterPage() {
  return (
    <AuthLayout title="Create account" description="Register a new z0-auth account">
      <Card>
        <CardHeader>
          <CardTitle>Register</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" />
          </div>
          <Button className="w-full" type="button" disabled>
            Register (coming soon)
          </Button>
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground">
          <a href="/login" className="hover:text-foreground">
            Already have an account? Sign in
          </a>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}
