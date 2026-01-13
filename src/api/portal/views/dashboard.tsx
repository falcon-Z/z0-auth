/**
 * Dashboard Page for App Portal Users
 */

/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";
import { AuthenticatedLayout } from "./authenticated-layout";

interface DashboardPageProps {
  app: {
    name: string;
    logo?: string;
    primaryColor?: string;
  };
  appSlug: string;
  user: {
    name: string;
    email: string;
  };
}

export const DashboardPage: FC<DashboardPageProps> = ({ app, appSlug, user }) => {
  return (
    <AuthenticatedLayout app={app} appSlug={appSlug} user={user} activePage="dashboard">
      <div class="card">
        <h1 class="card-title">Welcome, {user.name}!</h1>

        <p class="text-gray">
          You're signed in to {app.name}. From here you can manage your profile
          and account settings.
        </p>

        <div class="mt-6" style="display: flex; gap: 1rem;">
          <a href={`/api/portal/${appSlug}/profile`} class="btn btn-secondary">
            View Profile
          </a>
        </div>
      </div>
    </AuthenticatedLayout>
  );
};
