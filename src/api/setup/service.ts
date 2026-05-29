import type { BunRequest } from "bun";

import type { SetupRequest, SetupResponse } from "@z0/contracts/setup";
import { ErrorCodes } from "@z0/contracts/errors";
import {
  validatePassword,
  validatePasswordConfirm,
} from "@z0/contracts/password-policy";
import { normalizeEmail, validateEmail, validateRequiredString } from "@z0/contracts/validation";

import { loadConfig } from "../lib/config";
import { clientIp } from "../lib/rate-limit";
import { getDb } from "../lib/db";
import { problem } from "../lib/http";
import { hashPassword } from "../lib/password";
import { assignPlatformRole, assignTenantRole } from "../lib/roles";
import { uniqueTenantSlug } from "../lib/tenant";
import { checkRateLimit } from "../lib/rate-limit";

export type SetupResult =
  | { ok: true; response: SetupResponse }
  | { ok: false; response: Response };

export async function runSetup(req: BunRequest, body: SetupRequest): Promise<SetupResult> {
  const config = loadConfig();
  const installHeader = req.headers.get("x-install-token");
  if (config.installToken) {
    if (!installHeader) {
      return {
        ok: false,
        response: problem(403, "Forbidden", "Install token required", {
          errors: [
            {
              field: "_install",
              code: ErrorCodes.INSTALL_TOKEN_REQUIRED,
              message: "X-Install-Token header is required",
            },
          ],
        }),
      };
    }
    if (installHeader !== config.installToken) {
      return {
        ok: false,
        response: problem(403, "Forbidden", "Invalid install token", {
          errors: [
            {
              field: "_install",
              code: ErrorCodes.INSTALL_TOKEN_INVALID,
              message: "Invalid install token",
            },
          ],
        }),
      };
    }
  }

  const rate = checkRateLimit({
    key: `setup:${clientIp(req)}`,
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.allowed) {
    return {
      ok: false,
      response: problem(429, "Too Many Requests", "Setup rate limit exceeded", {
        errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Too many setup attempts" }],
        retryAfter: rate.retryAfterSec,
      }),
    };
  }

  const errors = [
    ...validateRequiredString(body.name, "name", "Name"),
    ...validateEmail(body.email),
    ...validateRequiredString(body.organizationName, "organizationName", "Organization name"),
    ...validatePassword(body.password ?? "", { email: body.email, name: body.name }),
    ...validatePasswordConfirm(body.password ?? "", body.passwordConfirm ?? ""),
  ];

  if (errors.length > 0) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid setup request", { errors }),
    };
  }

  const email = normalizeEmail(body.email);
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
        INSERT INTO users (email, name, email_verified_at)
        VALUES (${email}, ${body.name.trim()}, NOW())
        RETURNING id, email, name
      `;

      const userId = String((user as { id: string }).id);

      await tx`
        INSERT INTO password_credentials (user_id, password_hash)
        VALUES (${userId}, ${passwordHash})
      `;

      await tx`
        INSERT INTO platform_memberships (user_id, role)
        VALUES (${userId}, 'platform_admin')
      `;

      await tx`
        INSERT INTO tenant_memberships (user_id, tenant_id, role)
        VALUES (${userId}, ${tenantId}, 'tenant_admin')
      `;

      await assignPlatformRole(userId, "platform_admin", tx);
      await assignTenantRole(userId, tenantId, "tenant_admin", tx);

      await tx`
        INSERT INTO user_preferences (user_id, active_tenant_id)
        VALUES (${userId}, ${tenantId})
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
      return {
        ok: false,
        response: problem(409, "Conflict", "Platform setup has already been completed.", {
          errors: [{ field: "_setup", code: ErrorCodes.SETUP_COMPLETE, message: "Setup already completed" }],
        }),
      };
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
    };

    console.info(
      JSON.stringify({
        event: "setup.completed",
        userId: result.userId,
        tenantId: responseBody.tenant.id,
      }),
    );

    return { ok: true, response: responseBody };
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) {
      return {
        ok: false,
        response: problem(409, "Conflict", "A user with this email already exists."),
      };
    }
    throw error;
  }
}
