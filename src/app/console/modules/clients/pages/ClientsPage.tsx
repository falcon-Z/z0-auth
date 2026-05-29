export function ClientsPage() {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">OAuth Clients</h2>
      <p className="text-sm text-muted-foreground">
        Register application redirect URIs here. The authorization endpoint validates redirect URIs before issuing
        authorization codes.
      </p>
    </section>
  );
}
