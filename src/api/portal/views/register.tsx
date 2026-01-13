/**
 * Registration Page for App Portal
 */

/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";
import { Layout } from "./layout";

interface RegisterPageProps {
  app: {
    name: string;
    logo?: string;
    primaryColor?: string;
  };
  appSlug: string;
  error?: string;
}

export const RegisterPage: FC<RegisterPageProps> = ({ app, appSlug, error }) => {
  return (
    <Layout app={app} title="Create Account">
      <div class="card">
        <h1 class="card-title">Create your account</h1>

        <p class="text-gray text-sm mb-6">
          Sign up to get started with {app.name}
        </p>

        {error ? <div class="alert alert-error">{error}</div> : null}

        <form method="POST" action={`/api/portal/${appSlug}/register`}>
          <div class="form-group">
            <label class="form-label" for="name">
              Full Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              class="form-input"
              required
              autocomplete="name"
              placeholder="John Doe"
            />
          </div>

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
              autocomplete="new-password"
              placeholder="Create a strong password"
              minlength="8"
            />
          </div>

          <div class="mt-6">
            <button type="submit" class="btn btn-primary">
              Create Account
            </button>
          </div>
        </form>

        <p class="text-center text-sm text-gray mt-4">
          Already have an account?{" "}
          <a href={`/api/portal/${appSlug}/login`}>Sign in</a>
        </p>
      </div>
    </Layout>
  );
};
