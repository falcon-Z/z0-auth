import type { BunRequest } from "bun";

import type { SetupRequest, SetupResponse, SetupStatus } from "@shared/contracts/setup";
import { ErrorCodes } from "@shared/contracts/errors";
import {
  validatePassword,
  validatePasswordConfirm,
} from "@shared/contracts/password-policy";
import { normalizeEmail, parseJsonBody, validateEmail, validateRequiredString } from "@shared/contracts/validation";

import { loadConfig } from "../lib/config";
import { csrfCookieHeader, ensureCsrfToken, validateCsrf } from "../lib/csrf";
import { getDb } from "../lib/db";
import { json, problem } from "../lib/http";
import { hashPassword } from "../lib/password";
import { getPlatformSettings } from "../lib/platform";
import { generateRecoveryKey, hashRecoveryKey } from "../lib/recovery-key";
import { uniqueTenantSlug } from "../lib/tenant";
import { checkRateLimit, clientIp } from "../lib/rate-limit";

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

export const setupRoutes = {
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

      const config = loadConfig();
      const installHeader = req.headers.get("x-install-token");
      if (config.installToken) {
        if (!installHeader) {
          return problem(403, "Forbidden", "Install token required", {
            errors: [
              {
                field: "_install",
                code: ErrorCodes.INSTALL_TOKEN_REQUIRED,
                message: "X-Install-Token header is required",
              },
            ],
          });
        }
        if (installHeader !== config.installToken) {
          return problem(403, "Forbidden", "Invalid install token", {
            errors: [
              {
                field: "_install",
                code: ErrorCodes.INSTALL_TOKEN_INVALID,
                message: "Invalid install token",
              },
            ],
          });
        }
      }

      const rate = checkRateLimit({
        key: `setup:${clientIp(req)}`,
        limit: 3,
        windowMs: 60 * 60 * 1000,
      });
      if (!rate.allowed) {
        return problem(429, "Too Many Requests", "Setup rate limit exceeded", {
          errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Too many setup attempts" }],
          retryAfter: rate.retryAfterSec,
        });
      }

      const parsed = await parseJsonBody<SetupRequest>(req);
      if (!parsed.ok) return parsed.response;

      const body = parsed.body;
      const errors = [
        ...validateRequiredString(body.name, "name", "Name"),
        ...validateEmail(body.email),
        ...validateRequiredString(body.organizationName, "organizationName", "Organization name"),
        ...validatePassword(body.password ?? "", { email: body.email, name: body.name }),
        ...validatePasswordConfirm(body.password ?? "", body.passwordConfirm ?? ""),
      ];

      if (errors.length > 0) {
        return problem(400, "Validation Error", "Invalid setup request", { errors });
      }

      const email = normalizeEmail(body.email);
      const recoveryKey = generateRecoveryKey();
      const recoveryKeyHash = await hashRecoveryKey(recoveryKey);
      const passwordHash = await hashPassword(body.password);

      const db = getDb();

      try {
        const result = await db.begin(async (tx) => {
          const [settings] = await tx`
            SELECT setup_completed_at
            FROM platform_settings
            WHERE id = 1
            FOR UPDATE
          `;

          if (settings?.setup_completed_at) {
            return { conflict: true as const };
          }

          const organizationName = body.organizationName.trim();
          const slug = await uniqueTenantSlug(organizationName, tx);

          const [tenant] = await tx`
            INSERT INTO tenants (name, slug, is_default)
            VALUES (${organizationName}, ${slug}, true)
            RETURNING id, name, slug
          `;

          const tenantId = String((tenant as { id: string }).id);

          const [user] = await tx`
            INSERT INTO users (email, name, password_hash, email_verified_at)
            VALUES (${email}, ${body.name.trim()}, ${passwordHash}, NOW())
            RETURNING id, email, name
          `;

          const userId = String((user as { id: string }).id);

          await tx`
            INSERT INTO platform_memberships (user_id, role)
            VALUES (${userId}, 'platform_admin')
          `;

          await tx`
            INSERT INTO tenant_memberships (user_id, tenant_id, role)
            VALUES (${userId}, ${tenantId}, 'tenant_admin')
          `;

          await tx`
            INSERT INTO user_recovery_keys (user_id, key_hash)
            VALUES (${userId}, ${recoveryKeyHash})
          `;

          await tx`
            UPDATE platform_settings
            SET platform_name = ${organizationName},
                default_tenant_id = ${tenantId},
                setup_completed_at = NOW(),
                updated_at = NOW()
            WHERE id = 1
          `;

          return { conflict: false as const, user, userId, tenant };
        });

        if (result.conflict) {
          console.warn(JSON.stringify({ event: "setup.attempted_after_complete", ip: clientIp(req) }));
          return problem(409, "Conflict", "Platform setup has already been completed.", {
            errors: [{ field: "_setup", code: ErrorCodes.SETUP_COMPLETE, message: "Setup already completed" }],
          });
        }

        const responseBody: SetupResponse = {
          user: {
            id: result.userId,
            email: (result.user as { email: string }).email,
            name: (result.user as { name: string }).name,
          },
          organizationName: body.organizationName.trim(),
          tenant: {
            id: String((result.tenant as { id: string }).id),
            name: (result.tenant as { name: string }).name,
            slug: (result.tenant as { slug: string }).slug,
          },
          recoveryKey,
        };

        console.info(
          JSON.stringify({
            event: "setup.completed",
            userId: result.userId,
            tenantId: responseBody.tenant.id,
          }),
        );
        return json(responseBody, { status: 201 });
      } catch (error) {
        if (error instanceof Error && error.message.includes("unique")) {
          return problem(409, "Conflict", "A user with this email already exists.");
        }
        throw error;
      }
    },
  },
} as const;
