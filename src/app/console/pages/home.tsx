import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@z0/components/ui/card";

export function ConsoleHomePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">z0-auth</p>
            <h1 className="text-lg font-semibold">Management console</h1>
          </div>
          <nav className="flex gap-4 text-sm">
            <a href="/login" className="text-muted-foreground hover:text-foreground">
              Sign in
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Console baseline</CardTitle>
            <CardDescription>
              This SPA is served for application management. Public authentication flows live at
              dedicated routes such as /login.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>API health: <code className="rounded bg-muted px-1">GET /api/health</code></p>
            <p>Readiness: <code className="rounded bg-muted px-1">GET /api/ready</code></p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
