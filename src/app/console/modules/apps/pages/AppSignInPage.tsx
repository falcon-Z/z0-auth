import { useAppWorkspace } from "../../../context/app-workspace-context";
import { usePageBreadcrumbs } from "../../../hooks/use-page-breadcrumbs";

export function AppSignInPage() {
  const { appId, app } = useAppWorkspace();

  usePageBreadcrumbs(
    [
      { label: "Apps", to: "/apps" },
      { label: app.name, to: `/apps/${appId}/setup` },
      { label: "Sign-in page" },
    ],
    [app.name, appId],
  );

  return (
    <p className="text-sm text-muted-foreground">
      Branding, sign-in methods, and preview are not ready yet.
    </p>
  );
}
