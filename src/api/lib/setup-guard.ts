import { isSetupComplete } from "./platform";
import { problem } from "./http";

const ALLOWED_WHEN_INCOMPLETE = new Set([
  "/api/deploy/status",
  "/api/setup/status",
  "/api/health",
  "/api/live",
  "/api/ready",
]);

export async function checkSetupGuard(pathname: string): Promise<Response | null> {
  if (ALLOWED_WHEN_INCOMPLETE.has(pathname)) return null;
  if (pathname.startsWith("/api/setup")) return null;

  const complete = await isSetupComplete();
  if (!complete) {
    return problem(503, "Setup Required", "Platform setup must be completed before using this API.", {
      code: "SetupRequired",
    });
  }

  return null;
}
