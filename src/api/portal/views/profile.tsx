/**
 * Profile Page for App Portal Users
 */

/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";
import { AuthenticatedLayout } from "./authenticated-layout";

interface ProfilePageProps {
  app: {
    name: string;
    logo?: string;
    primaryColor?: string;
  };
  appSlug: string;
  user: {
    name: string;
    email: string;
    avatar?: string;
  };
  success?: string;
  error?: string;
}

export const ProfilePage: FC<ProfilePageProps> = ({
  app,
  appSlug,
  user,
  success,
  error,
}) => {
  return (
    <AuthenticatedLayout app={app} appSlug={appSlug} user={user} activePage="profile">
      <div class="card">
        <h1 class="card-title">Your Profile</h1>

        {success ? <div class="alert alert-success">{success}</div> : null}
        {error ? <div class="alert alert-error">{error}</div> : null}

        <div class="profile-info">
          <div class="profile-avatar">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;"
              />
            ) : (
              <div
                style="width: 80px; height: 80px; border-radius: 50%; background-color: #e5e7eb; display: flex; align-items: center; justify-content: center; font-size: 2rem; color: #6b7280;"
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div class="profile-details mt-4">
            <div class="form-group">
              <label class="form-label">Name</label>
              <p style="font-size: 1rem; color: #111827;">{user.name}</p>
            </div>

            <div class="form-group">
              <label class="form-label">Email</label>
              <p style="font-size: 1rem; color: #111827;">{user.email}</p>
            </div>
          </div>
        </div>

        <div class="mt-6">
          <a href={`/api/portal/${appSlug}/dashboard`} class="btn btn-secondary">
            Back to Dashboard
          </a>
        </div>
      </div>
    </AuthenticatedLayout>
  );
};
