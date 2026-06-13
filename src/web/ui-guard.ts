import type { BunRequest } from "bun";

import type { AppAuthRealm, AuthRealm } from "../api/lib/auth-realm";
import { handleDatabaseConnectionError } from "../api/lib/database-errors";
import { resolveAppSession } from "../api/lib/app-session";
import { isSetupComplete } from "../api/lib/instance";
import { resolveSession } from "../api/lib/session";
import { safeReturnPath } from "./safe-return-path";

export type AuthPage = "setup" | "login" | "register" | "forgot-password" | "home";

function appRealm(realm: AuthRealm): AppAuthRealm | null {
  return realm.mode === "app" ? realm : null;
}

export async function redirectForAuthPage(
  req: BunRequest,
  page: AuthPage,
  realm: AuthRealm = { mode: "console" },
): Promise<Response | null> {
  const url = new URL(req.url);

  if (realm.mode === "invalid") return null;

  try {
    const complete = await isSetupComplete();

    if (!complete) {
      if (page === "setup") return null;
      return Response.redirect(new URL("/auth/setup", url), 302);
    }

    if (page === "setup") {
      return Response.redirect(new URL("/auth/login", url), 302);
    }

    const app = appRealm(realm);
    if (app) {
      const appSession = await resolveAppSession(req);
      const signedInToApp = Boolean(appSession && appSession.appId === app.appId);

      if (signedInToApp && (page === "login" || page === "register")) {
        const location = safeReturnPath(url.searchParams.get("return_to"), "/oauth/resume");
        return Response.redirect(new URL(location, url), 302);
      }

      return null;
    }

    const session = await resolveSession(req);
    const signedIn = Boolean(session);

    if (signedIn && (page === "login" || page === "register" || page === "forgot-password")) {
      return Response.redirect(new URL("/", url), 302);
    }

    if (!signedIn && page === "home") {
      return Response.redirect(new URL("/auth/login", url), 302);
    }

    return null;
  } catch (error) {
    const unavailable = await handleDatabaseConnectionError(error);
    if (unavailable) return null;
    console.error("UI guard failed:", error instanceof Error ? error.message : error);
    if (page === "setup") return null;
    return Response.redirect(new URL("/auth/setup", url), 302);
  }
}
