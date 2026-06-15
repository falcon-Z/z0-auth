import type { BunRequest } from "bun";

import type { SignInMethod } from "@z0/contracts/auth-settings";
import { ErrorCodes } from "@z0/contracts/errors";
import { normalizeEmail, validateEmail, validateRequiredString } from "@z0/contracts/validation";

import { writeAuditEvent } from "./audit";
import { sha256Hex, randomToken } from "./crypto";
import { getDb } from "./db";
import { problem } from "./http";
import { isSmtpReady } from "./smtp-settings";
import { checkRateLimit, clientIp } from "./rate-limit";
import { magicLinkEmailText, sendTransactionalEmail } from "./transactional-email";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const GENERIC_MESSAGE = "Check your email for a sign-in link.";

export type MagicLinkRealm = "console" | "app";

export type MagicLinkSendOutcome =
  | { ok: true; sent: true }
  | { ok: true; sent: false; reason: "no_account" | "account_disabled" | "delivery_failed" }
  | { ok: false; response: Response };

type MagicLinkDeliveryOptions = {
  realm: MagicLinkRealm;
  email: string;
  appId?: string;
  appName?: string;
  clientId?: string;
  returnTo?: string;
};

function magicLinkUrlFromRequest(req: Request, rawToken: string, options?: { clientId?: string; returnTo?: string }): string {
  const url = new URL(req.url);
  const path = `/auth/magic-link/${encodeURIComponent(rawToken)}`;
  const link = new URL(path, url.origin);
  if (options?.clientId) link.searchParams.set("client_id", options.clientId);
  if (options?.returnTo) link.searchParams.set("return_to", options.returnTo);
  return link.toString();
}

type MagicLinkUserLookup =
  | { status: "active"; userId: string }
  | { status: "disabled" }
  | { status: "missing" };

async function lookupConsoleUserByEmail(email: string): Promise<MagicLinkUserLookup> {
  const [row] = await getDb()`
    SELECT id, status FROM users WHERE lower(email) = ${email} LIMIT 1
  `;
  if (!row) return { status: "missing" };
  const r = row as { id: string; status: string };
  if (r.status === "disabled") return { status: "disabled" };
  return { status: "active", userId: String(r.id) };
}

async function lookupAppUserByEmail(appId: string, email: string): Promise<MagicLinkUserLookup> {
  const [row] = await getDb()`
    SELECT id, status
    FROM app_users
    WHERE app_id = ${appId}
      AND lower(email) = ${email}
    LIMIT 1
  `;
  if (!row) return { status: "missing" };
  const r = row as { id: string; status: string };
  if (r.status === "disabled") return { status: "disabled" };
  return { status: "active", userId: String(r.id) };
}

async function findConsoleUserIdByEmail(email: string): Promise<string | null> {
  const lookup = await lookupConsoleUserByEmail(email);
  return lookup.status === "active" ? lookup.userId : null;
}

async function findAppUserIdByEmail(appId: string, email: string): Promise<string | null> {
  const lookup = await lookupAppUserByEmail(appId, email);
  return lookup.status === "active" ? lookup.userId : null;
}

async function invalidatePendingMagicLinks(
  realm: MagicLinkRealm,
  email: string,
  appId: string | undefined,
  exceptTokenHash: string,
): Promise<void> {
  if (realm === "console") {
    await getDb()`
      UPDATE magic_link_tokens
      SET used_at = NOW()
      WHERE realm = 'console'
        AND lower(email) = ${email}
        AND token_hash <> ${exceptTokenHash}
        AND used_at IS NULL
        AND expires_at > NOW()
    `;
    return;
  }
  await getDb()`
    UPDATE magic_link_tokens
    SET used_at = NOW()
    WHERE realm = 'app'
      AND app_id = ${appId}
      AND lower(email) = ${email}
      AND token_hash <> ${exceptTokenHash}
      AND used_at IS NULL
      AND expires_at > NOW()
  `;
}

export async function sendMagicLinkForHostedAuth(
  req: BunRequest,
  options: MagicLinkDeliveryOptions,
): Promise<MagicLinkSendOutcome> {
  if (!(await isSmtpReady())) {
    return { ok: true, sent: false, reason: "delivery_failed" };
  }

  const requiredErrors = validateRequiredString(options.email, "email", "Email");
  if (requiredErrors.length) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid request.", { errors: requiredErrors }),
    };
  }
  const email = normalizeEmail(options.email);
  const emailErrors = validateEmail(email);
  if (emailErrors.length) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid request.", { errors: emailErrors }),
    };
  }

  const ip = clientIp(req);
  const ipLimit = checkRateLimit({ key: `magic:ip:${ip}`, limit: 10, windowMs: 15 * 60 * 1000 });
  if (!ipLimit.allowed) {
    return {
      ok: false,
      response: problem(429, "Too Many Requests", "Too many sign-in link requests. Try again later.", {
        code: ErrorCodes.RATE_LIMITED,
        retryAfter: ipLimit.retryAfterSec,
        errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Too many attempts" }],
      }),
    };
  }

  const emailLimit = checkRateLimit({
    key: `magic:email:${options.realm}:${options.appId ?? "console"}:${email}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!emailLimit.allowed) {
    return {
      ok: false,
      response: problem(429, "Too Many Requests", "Too many sign-in link requests. Try again later.", {
        code: ErrorCodes.RATE_LIMITED,
        retryAfter: emailLimit.retryAfterSec,
        errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Too many attempts" }],
      }),
    };
  }

  const userLookup =
    options.realm === "console"
      ? await lookupConsoleUserByEmail(email)
      : options.appId
        ? await lookupAppUserByEmail(options.appId, email)
        : { status: "missing" as const };

  if (userLookup.status === "disabled") {
    return { ok: true, sent: false, reason: "account_disabled" };
  }

  const userId = userLookup.status === "active" ? userLookup.userId : null;

  if (!userId) {
    return { ok: true, sent: false, reason: "no_account" };
  }

  const rawToken = randomToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);

  await getDb()`
    INSERT INTO magic_link_tokens (realm, app_id, email, token_hash, expires_at)
    VALUES (
      ${options.realm},
      ${options.appId ?? null},
      ${email},
      ${tokenHash},
      ${expiresAt}
    )
  `;

  const link = magicLinkUrlFromRequest(req, rawToken, {
    clientId: options.clientId,
    returnTo: options.returnTo,
  });
  const appName = options.appName ?? process.env.APP_NAME ?? "z0-auth";
  const template = magicLinkEmailText({ appName, link, expiresMinutes: 15 });
  const delivery = await sendTransactionalEmail({ to: email, subject: template.subject, text: template.text });

  if (delivery.status !== "sent") {
    await getDb()`DELETE FROM magic_link_tokens WHERE token_hash = ${tokenHash}`;
    return { ok: true, sent: false, reason: "delivery_failed" };
  }

  await invalidatePendingMagicLinks(options.realm, email, options.appId, tokenHash);

  await writeAuditEvent({
    actorUserId: userId,
    action: "magic_link.requested",
    resourceType: options.realm === "console" ? "user" : "app_user",
    resourceId: userId,
    payload: { email, realm: options.realm, appId: options.appId ?? null },
  });

  return { ok: true, sent: true };
}

export async function requestMagicLink(
  req: BunRequest,
  options: MagicLinkDeliveryOptions & {
    allowedMethods: SignInMethod[];
  },
): Promise<Response> {
  if (!options.allowedMethods.includes("magic_link")) {
    return problem(403, "Forbidden", "Magic link sign-in is not enabled.", {
      errors: [
        {
          field: "_magic",
          code: ErrorCodes.PERMISSION_DENIED,
          message: "Magic link sign-in is not enabled for this context",
        },
      ],
    });
  }

  if (!(await isSmtpReady())) {
    return problem(503, "Service Unavailable", "Magic link sign-in is not available until email is configured and verified.", {
      errors: [
        {
          field: "_magic",
          code: ErrorCodes.PASSWORD_RESET_UNAVAILABLE,
          message: "Email is not ready for automated delivery",
        },
      ],
    });
  }

  const outcome = await sendMagicLinkForHostedAuth(req, options);
  if (!outcome.ok) return outcome.response;

  return new Response(JSON.stringify({ ok: true, message: GENERIC_MESSAGE }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function previewMagicLinkToken(
  rawToken: string,
): Promise<
  | { ok: true; realm: MagicLinkRealm; email: string; appId: string | null }
  | { ok: false; response: Response }
> {
  const tokenHash = await sha256Hex(rawToken);
  const [row] = await getDb()`
    SELECT realm, app_id, email, expires_at, used_at
    FROM magic_link_tokens
    WHERE token_hash = ${tokenHash}
  `;
  if (!row) return invalidMagicLinkResponse();

  const r = row as {
    realm: MagicLinkRealm;
    app_id: string | null;
    email: string;
    expires_at: Date;
    used_at: Date | null;
  };

  if (r.used_at || new Date(r.expires_at).getTime() < Date.now()) {
    return invalidMagicLinkResponse();
  }

  return {
    ok: true,
    realm: r.realm,
    email: normalizeEmail(r.email),
    appId: r.app_id ? String(r.app_id) : null,
  };
}

export async function consumeMagicLinkToken(
  rawToken: string,
): Promise<
  | { ok: true; realm: MagicLinkRealm; email: string; appId: string | null; userId: string }
  | { ok: false; response: Response }
> {
  const tokenHash = await sha256Hex(rawToken);
  const [row] = await getDb()`
    UPDATE magic_link_tokens
    SET used_at = NOW()
    WHERE token_hash = ${tokenHash}
      AND used_at IS NULL
      AND expires_at > NOW()
    RETURNING realm, app_id, email
  `;
  if (!row) {
    return invalidMagicLinkResponse();
  }

  const r = row as {
    realm: MagicLinkRealm;
    app_id: string | null;
    email: string;
  };

  const email = normalizeEmail(r.email);
  const userId =
    r.realm === "console"
      ? await findConsoleUserIdByEmail(email)
      : r.app_id
        ? await findAppUserIdByEmail(r.app_id, email)
        : null;

  if (!userId) {
    return invalidMagicLinkResponse();
  }

  await writeAuditEvent({
    actorUserId: userId,
    action: "magic_link.used",
    resourceType: r.realm === "console" ? "user" : "app_user",
    resourceId: userId,
    payload: { email, realm: r.realm, appId: r.app_id },
  });

  return {
    ok: true,
    realm: r.realm,
    email,
    appId: r.app_id ? String(r.app_id) : null,
    userId,
  };
}

function invalidMagicLinkResponse(): { ok: false; response: Response } {
  return {
    ok: false,
    response: problem(400, "Validation Error", "This sign-in link is invalid or has expired.", {
      errors: [
        {
          field: "token",
          code: ErrorCodes.RESET_TOKEN_INVALID,
          message: "This sign-in link is invalid or has expired",
        },
      ],
    }),
  };
}
