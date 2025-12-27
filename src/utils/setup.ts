import { Logger } from "./error-handling";
import { isSetupComplete } from "./setup-state";

let openCount = 0;

export async function ensureSuperAdminExists(serverUrl: string): Promise<void> {
  const setupComplete = isSetupComplete();

  if (!setupComplete) {
    const setupUrl = `${serverUrl}setup`;
    Logger.warn(
      "No SUPER_ADMIN found, setup required. Only one SUPER_ADMIN should exist.",
      {
        setupUrl,
        serverUrl,
      }
    );

    console.warn(
      `[SETUP] No SUPER_ADMIN found. Please visit ${setupUrl} to configure super admin credentials.`
    );

    if (process.env.NODE_ENV !== "production" && openCount === 0) {
      openCount++;
      try {
        const open = await import("open");
        await open.default(setupUrl);
        Logger.info("Browser opened automatically for setup", { setupUrl });
      } catch (error) {
        Logger.warn("Could not open browser automatically", {
          error: error.message,
          setupUrl,
        });
      }
    }
  } else {
    Logger.info("Super admin exists, setup not required");
  }
}
