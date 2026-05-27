export function DashboardPage() {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Dashboard</h2>
      <p className="text-sm text-muted-foreground">
        Setup is complete. This console is now served through Bun with API routes mounted under <code>/api/*</code>.
      </p>
    </section>
  );
}
