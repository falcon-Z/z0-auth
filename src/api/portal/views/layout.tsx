/**
 * Base Layout for App Portal
 *
 * Server-side rendered HTML layout using Hono JSX.
 * Provides consistent styling across all portal pages.
 */

/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";
import { html } from "hono/html";

interface LayoutProps {
  app: {
    name: string;
    logo?: string;
    primaryColor?: string;
  };
  title: string;
  children: any;
}

export const Layout: FC<LayoutProps> = ({ app, title, children }) => {
  const primaryColor = app.primaryColor || "#3b82f6";

  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>
          {title} | {app.name}
        </title>
        <style>
          {html`
            :root {
              --primary-color: ${primaryColor};
              --primary-hover: color-mix(in srgb, ${primaryColor} 85%, black);
            }

            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                "Helvetica Neue", Arial, sans-serif;
              background-color: #f9fafb;
              min-height: 100vh;
              color: #1f2937;
              line-height: 1.5;
            }

            .header {
              background-color: white;
              border-bottom: 1px solid #e5e7eb;
              padding: 1rem 1.5rem;
              display: flex;
              align-items: center;
              gap: 0.75rem;
            }

            .header-logo {
              height: 2rem;
              width: auto;
            }

            .header-title {
              font-size: 1.25rem;
              font-weight: 600;
              color: #111827;
            }

            .main {
              max-width: 28rem;
              margin: 0 auto;
              padding: 2rem 1rem;
            }

            .card {
              background-color: white;
              border-radius: 0.5rem;
              box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1),
                0 1px 2px -1px rgb(0 0 0 / 0.1);
              padding: 1.5rem;
            }

            .card-title {
              font-size: 1.5rem;
              font-weight: 700;
              margin-bottom: 1.5rem;
              color: #111827;
            }

            .form-group {
              margin-bottom: 1rem;
            }

            .form-label {
              display: block;
              font-size: 0.875rem;
              font-weight: 500;
              margin-bottom: 0.25rem;
              color: #374151;
            }

            .form-input {
              width: 100%;
              padding: 0.5rem 0.75rem;
              border: 1px solid #d1d5db;
              border-radius: 0.375rem;
              font-size: 1rem;
              line-height: 1.5;
              transition: border-color 0.15s, box-shadow 0.15s;
            }

            .form-input:focus {
              outline: none;
              border-color: var(--primary-color);
              box-shadow: 0 0 0 3px
                color-mix(in srgb, var(--primary-color) 20%, transparent);
            }

            .btn {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              padding: 0.5rem 1rem;
              font-size: 0.875rem;
              font-weight: 500;
              border-radius: 0.375rem;
              cursor: pointer;
              transition: background-color 0.15s, opacity 0.15s;
              text-decoration: none;
            }

            .btn-primary {
              width: 100%;
              background-color: var(--primary-color);
              color: white;
              border: none;
              padding: 0.625rem 1rem;
            }

            .btn-primary:hover {
              background-color: var(--primary-hover);
            }

            .btn-secondary {
              background-color: white;
              color: #374151;
              border: 1px solid #d1d5db;
            }

            .btn-secondary:hover {
              background-color: #f9fafb;
            }

            .alert {
              padding: 0.75rem 1rem;
              border-radius: 0.375rem;
              margin-bottom: 1rem;
              font-size: 0.875rem;
            }

            .alert-error {
              background-color: #fef2f2;
              color: #991b1b;
              border: 1px solid #fecaca;
            }

            .alert-success {
              background-color: #f0fdf4;
              color: #166534;
              border: 1px solid #bbf7d0;
            }

            .text-center {
              text-align: center;
            }

            .text-sm {
              font-size: 0.875rem;
            }

            .text-gray {
              color: #6b7280;
            }

            .mt-4 {
              margin-top: 1rem;
            }

            .mt-6 {
              margin-top: 1.5rem;
            }

            .mb-6 {
              margin-bottom: 1.5rem;
            }

            a {
              color: var(--primary-color);
              text-decoration: none;
            }

            a:hover {
              text-decoration: underline;
            }

            .user-menu {
              margin-left: auto;
              display: flex;
              align-items: center;
              gap: 1rem;
            }

            .user-name {
              font-size: 0.875rem;
              color: #374151;
            }

            .nav-links {
              display: flex;
              gap: 1.5rem;
              margin-left: 2rem;
            }

            .nav-link {
              font-size: 0.875rem;
              color: #6b7280;
              text-decoration: none;
            }

            .nav-link:hover {
              color: #111827;
            }

            .nav-link.active {
              color: var(--primary-color);
              font-weight: 500;
            }
          `}
        </style>
      </head>
      <body>
        <header class="header">
          {app.logo ? (
            <img src={app.logo} alt={app.name} class="header-logo" />
          ) : null}
          <span class="header-title">{app.name}</span>
        </header>
        <main class="main">{children}</main>
      </body>
    </html>
  );
};
