/**
 * Login Page for App Portal
 */

/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";
import { Layout } from "./layout";

interface LoginPageProps {
  app: {
    name: string;
    logo?: string;
    primaryColor?: string;
    welcomeText?: string;
  };
  appSlug: string;
  allowRegistration?: boolean;
  error?: string;
  success?: string;
}

export const LoginPage: FC<LoginPageProps> = ({
  app,
  appSlug,
  allowRegistration = false,
  error,
  success,
}) => {
  return (
    <Layout app={app} title="Sign In">
      <div class="card">
        <h1 class="card-title">Sign in to {app.name}</h1>

        {app.welcomeText ? (
          <p class="text-gray text-sm mb-6">{app.welcomeText}</p>
        ) : null}

        {error ? <div class="alert alert-error">{error}</div> : null}

        {success ? <div class="alert alert-success">{success}</div> : null}

        <form method="POST" action={`/api/portal/${appSlug}/login`}>
          <div class="form-group">
            <label class="form-label" for="email">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              class="form-input"
              required
              autocomplete="email"
              placeholder="you@example.com"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="password">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              class="form-input"
              required
              autocomplete="current-password"
              placeholder="Enter your password"
            />
          </div>

          <div class="mt-6">
            <button type="submit" class="btn btn-primary">
              Sign In
            </button>
          </div>
        </form>

        {allowRegistration ? (
          <p class="text-center text-sm text-gray mt-4">
            Don't have an account?{" "}
            <a href={`/api/portal/${appSlug}/register`}>Create one</a>
          </p>
        ) : null}
      </div>
    </Layout>
  );
};
