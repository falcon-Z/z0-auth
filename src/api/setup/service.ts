import type { BunRequest } from "bun";
import { timingSafeEqual } from "node:crypto";

import type { SetupRequest, SetupResponse } from "@z0/contracts/setup";
import { ErrorCodes } from "@z0/contracts/errors";
import {
  validatePassword,
  validatePasswordConfirm,
} from "@z0/contracts/password-policy";
import { normalizeEmail, validateEmail, validateRequiredString } from "@z0/contracts/validation";

import { loadConfig } from "../lib/config";
import { clientIp } from "../lib/rate-limit";
import { checkDatabaseSchema, getDb } from "../lib/db";
import { problem } from "../lib/http";
import { hashPassword } from "../lib/password";
import { assignBootstrapOwnerRoleInTx } from "../lib/platform-rbac";
import { checkRateLimit } from "../lib/rate-limit";

export type SetupRunOptions = {
  /** HTML forms pass the token in the body; JSON API uses X-Install-Token. */
  installToken?: string;
};

export type SetupResult =
  | { ok: true; response: SetupResponse }
  | { ok: false; response: Response };

type SetupSource = "api" | "config";

async function requireSetupSchema(): Promise<Response | null> {
  const schema = await checkDatabaseSchema();
  if (schema.ready) return null;
  return problem(503, "Service Unavailable", "Database schema is not ready. Run migrations first.", {
    errors: [
      {
        field: "_schema",
        code: ErrorCodes.DATABASE_UNAVAILABLE,
        message: "Apply database migrations before setup (bun run db:migrate).",
      },
    ],
  });
}

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function validateInstallToken(
  config: ReturnType<typeof loadConfig>,
  token: string | null | undefined,
): Response | null {
  if (!config.installToken) return null;

  const value = token?.trim();
  if (!value) {
    return problem(403, "Forbidden", "Install token required", {
      errors: [
        {
          field: "_install",
          code: ErrorCodes.INSTALL_TOKEN_REQUIRED,
          message: "Install token is required",
        },
      ],
    });
  }
  if (!tokensMatch(value, config.installToken)) {
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
  return null;
}

function validateSetupBody(body: SetupRequest) {
  return [
    ...validateRequiredString(body.name, "name", "Name"),
    ...validateEmail(body.email),
    ...validateRequiredString(body.organizationName, "organizationName", "Organization name"),
    ...validatePassword(body.password ?? "", { email: body.email, name: body.name }),
    ...validatePasswordConfirm(body.password ?? "", body.passwordConfirm ?? ""),
  ];
}

export async function createBootstrapOwner(
  body: SetupRequest,
  options: { source: SetupSource; ip?: string } = { source: "config" },
): Promise<SetupResult> {
  const schemaError = await requireSetupSchema();
  if (schemaError) return { ok: false, response: schemaError };

  const errors = validateSetupBody(body);

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
        FROM instance_settings
        WHERE id = 1
        FOR UPDATE
      `;

      if (settings?.setup_completed_at) {
        return { conflict: true as const };
      }

      const organizationName = body.organizationName.trim();

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
        INSERT INTO instance_members (user_id, is_bootstrap)
        VALUES (${userId}, true)
      `;

      await tx`
        UPDATE instance_settings
        SET organization_name = ${organizationName},
            setup_completed_at = NOW(),
            updated_at = NOW()
        WHERE id = 1
      `;

      await assignBootstrapOwnerRoleInTx(tx, userId);

      return { conflict: false as const, user, userId, organizationName };
    });

    if (result.conflict) {
      console.warn(
        JSON.stringify({
          event: "setup.attempted_after_complete",
          source: options.source,
          ...(options.ip ? { ip: options.ip } : {}),
        }),
      );
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
      organizationName: result.organizationName,
    };

    console.info(
      JSON.stringify({
        event: "setup.completed",
        source: options.source,
        userId: result.userId,
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

export async function runSetup(
  req: BunRequest,
  body: SetupRequest,
  options: SetupRunOptions = {},
): Promise<SetupResult> {
  const config = loadConfig();

  const schemaError = await requireSetupSchema();
  if (schemaError) return { ok: false, response: schemaError };

  const installToken = options.installToken ?? req.headers.get("x-install-token");
  const installError = validateInstallToken(config, installToken);
  if (installError) {
    return { ok: false, response: installError };
  }

  const ip = clientIp(req);
  const rate = await checkRateLimit({
    key: `setup:${ip}`,
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

  return createBootstrapOwner(body, { source: "api", ip });
}
