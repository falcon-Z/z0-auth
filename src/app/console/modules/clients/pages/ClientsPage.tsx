import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@z0/components/ui/card";

export function ClientsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">OAuth clients</h2>
        <p className="text-sm text-muted-foreground">
          Client registration APIs are planned for a later phase. This page is reserved in the console navigation.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coming later</CardTitle>
          <CardDescription>Phase 3 — OAuth 2.1 authorization server</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The browser authorization stub lives at <code className="text-foreground">/oauth/authorize</code>. Console
          management for redirect URIs and credentials will ship with the token and client APIs.
        </CardContent>
      </Card>
    </div>
  );
}
