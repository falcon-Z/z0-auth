import type { BunRequest } from "bun";

import type { SetupRequest, SetupStatus } from "@z0/contracts/setup";
import { parseJsonBody } from "@z0/contracts/validation";

import { csrfCookieHeader, ensureCsrfToken, validateCsrf } from "../lib/csrf";
import { loadConfig } from "../lib/config";
import { checkDatabaseSchema } from "../lib/db";
import { json, problem } from "../lib/http";
import { getInstanceSettings } from "../lib/instance";
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
      const config = loadConfig();
      const schema = await checkDatabaseSchema();

      let completed = false;
      let organizationName: string | undefined;
      if (schema.ready) {
        try {
          const settings = await getInstanceSettings();
          completed = settings.setupCompleted;
          if (completed && settings.organizationName) {
            organizationName = settings.organizationName;
          }
        } catch {
          /* treat as incomplete */
        }
      }

      const body: SetupStatus = {
        completed,
        schemaReady: schema.ready,
        installTokenRequired: Boolean(config.installToken),
        ...(organizationName ? { organizationName } : {}),
      };

      const { token, setCookie } = ensureCsrfToken(req);
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
