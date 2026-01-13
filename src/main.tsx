/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./app/routes";
import { ErrorBoundary } from "./app/components/shared/error-boundary";
import { fetchSetupStatus } from "./utils/config-state";

const elem = document.getElementById("root")!;

// Initialize setup status before rendering
// This prevents navigation loops by ensuring status is cached before router runs
async function initializeApp() {
  try {
    // Fetch setup status from server and cache it
    await fetchSetupStatus();
  } catch (error) {
    console.error("Failed to initialize setup status:", error);
    // Continue anyway - will default to requiring setup (safe default)
  }

  const app = (
    <StrictMode>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </StrictMode>
  );

  if (import.meta.hot) {
    // With hot module reloading, `import.meta.hot.data` is persisted.
    const root = (import.meta.hot.data.root ??= createRoot(elem));
    root.render(app);
  } else {
    // The hot module reloading API is not available in production.
    createRoot(elem).render(app);
  }
}

// Start the app
initializeApp();
