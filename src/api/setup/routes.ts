import type { BunRequest } from "bun";

import type { SetupRequest, SetupStatus } from "@z0/contracts/setup";
import { parseJsonBody } from "@z0/contracts/validation";

import { csrfCookieHeader, ensureCsrfToken, validateCsrf } from "../lib/csrf";
import { loadConfig } from "../lib/config";
import { json, problem } from "../lib/http";
import { getPlatformSettings } from "../lib/platform";
import { runSetup } from "./service";

function appendSetCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  const existing = headers.get("Set-Cookie");
  if (existing) {
    headers.append("Set-Cookie", cookie);
  } else {
    headers.set("Set-Cookie", cookie);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const setupApiRoutes = {
  "/api/setup/status": {
    async GET(req: BunRequest) {
      const settings = await getPlatformSettings();
      const body: SetupStatus = {
        completed: settings.setupCompleted,
        ...(settings.setupCompleted && settings.organizationName
          ? { organizationName: settings.organizationName }
          : {}),
      };

      const { token, setCookie } = ensureCsrfToken(req);
      const config = loadConfig();
      let response = json(body);
      if (setCookie) {
        response = appendSetCookie(response, csrfCookieHeader(token, config.nodeEnv === "production"));
      }
      return response;
    },
  },

  "/api/setup": {
    async POST(req: BunRequest) {
      const csrfError = validateCsrf(req);
      if (csrfError) return csrfError;

      const parsed = await parseJsonBody<SetupRequest>(req);
      if (!parsed.ok) return parsed.response;

      const result = await runSetup(req, parsed.body);
      if (!result.ok) return result.response;
      return json(result.response, { status: 201 });
    },
  },
} as const;
