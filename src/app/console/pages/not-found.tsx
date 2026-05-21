import { Link } from "react-router-dom";

export function ConsoleNotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center space-y-3">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground text-sm">This route is not part of the management console yet.</p>
        <Link to="/" className="text-sm underline">
          Back to console home
        </Link>
      </div>
    </div>
  );
}
