/**
 * Error Page for App Portal
 */

/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";
import { html } from "hono/html";

interface ErrorPageProps {
  title: string;
  message: string;
}

export const ErrorPage: FC<ErrorPageProps> = ({ title, message }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <style>
          {html`
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
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 1rem;
            }

            .error-container {
              text-align: center;
              max-width: 28rem;
            }

            .error-icon {
              width: 4rem;
              height: 4rem;
              margin: 0 auto 1.5rem;
              color: #ef4444;
            }

            .error-title {
              font-size: 1.5rem;
              font-weight: 700;
              color: #111827;
              margin-bottom: 0.5rem;
            }

            .error-message {
              color: #6b7280;
              line-height: 1.5;
            }
          `}
        </style>
      </head>
      <body>
        <div class="error-container">
          <svg
            class="error-icon"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h1 class="error-title">{title}</h1>
          <p class="error-message">{message}</p>
        </div>
      </body>
    </html>
  );
};
