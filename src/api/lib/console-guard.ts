import type { BunRequest } from "bun";

import { isSetupComplete } from "./platform";
import { resolveSession } from "./session";

/** Server-side redirects before serving the console HTML bundle. */
export async function guardConsoleEntry(req: BunRequest): Promise<Response> {
  const url = new URL(req.url);

  try {
    const complete = await isSetupComplete();
    if (!complete) {
      return Response.redirect(new URL("/setup", url), 302);
    }

    const session = await resolveSession(req);
    if (!session) {
      return Response.redirect(new URL("/login", url), 302);
    }

    return Response.redirect(new URL("/console", url), 302);
  } catch (error) {
    console.error("Console guard failed:", error);
    return Response.redirect(new URL("/setup", url), 302);
  }
}
