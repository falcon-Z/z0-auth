import { AuthLayout } from "../components/auth-layout";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@z0/components/ui/card";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";

export function LoginPage() {
  return (
    <AuthLayout title="Sign in" description="Authenticate to your z0-auth tenant">
      <Card>
        <CardHeader>
          <CardTitle>Login</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" placeholder="you@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" />
          </div>
          <Button className="w-full" type="button" disabled>
            Sign in (coming soon)
          </Button>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 text-sm text-muted-foreground">
          <a href="/register" className="hover:text-foreground">
            Create an account
          </a>
          <a href="/forgot-password" className="hover:text-foreground">
            Forgot password?
          </a>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}
