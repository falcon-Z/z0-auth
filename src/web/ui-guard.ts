import type { BunRequest } from "bun";

import { isSetupComplete } from "../api/lib/platform";
import { resolveSession } from "../api/lib/session";

export type AuthPage = "setup" | "login" | "register" | "forgot-password" | "home";

export async function redirectForAuthPage(
  req: BunRequest,
  page: AuthPage,
): Promise<Response | null> {
  const url = new URL(req.url);

  try {
    const complete = await isSetupComplete();

    if (!complete) {
      if (page === "setup") return null;
      return Response.redirect(new URL("/auth/setup", url), 302);
    }

    if (page === "setup") {
      return Response.redirect(new URL("/auth/login", url), 302);
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
    console.error("UI guard failed:", error);
    if (page === "setup") return null;
    return Response.redirect(new URL("/auth/setup", url), 302);
  }
}
