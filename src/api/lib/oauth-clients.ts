import type { SQL } from "bun";
import type {
  Assurance,
  CreateClientRequest,
  CreateClientResponse,
  OAuthClientSummary,
  PatchClientRequest,
} from "@z0/contracts/apps";
import { validateRequiredString } from "@z0/contracts/validation";
import { getDb, pgTextArray } from "./db";
import { problem } from "./http";
import { randomToken } from "./crypto";
import { hashPassword } from "./password";
import { loadConfig } from "./config";
import { validateRedirectUris } from "./redirect-uris";

type ClientRow = {
  id: string;
  app_id: string;
  client_id: string;
  label: string;
  client_type: "public" | "confidential";
  purpose: "interactive" | "workload";
  status: OAuthClientSummary["status"];
  redirect_uris: string[];
  browser_origins: string[];
  refresh_enabled: boolean;
  assurance_override: Assurance | null;
  created_at: Date;
  updated_at: Date;
  disabled_at: Date | null;
  client_secret_hash: string | null;
};
type ClientConfig = Required<CreateClientRequest>;
function fail(status: number, detail: string, field = "client") {
  return {
    ok: false as const,
    response: problem(
      status,
      status === 404 ? "Not Found" : "Validation Error",
      detail,
      {
        errors: [
          { field, code: "invalid_client_configuration", message: detail },
        ],
      },
    ),
  };
}
function mapClient(row: ClientRow, minimum: Assurance): OAuthClientSummary {
  return {
    id: String(row.id),
    appId: String(row.app_id),
    clientId: row.client_id,
    label: row.label,
    clientType: row.client_type,
    purpose: row.purpose,
    status: row.status,
    redirectUris: row.redirect_uris,
    browserOrigins: row.browser_origins,
    refreshEnabled: row.refresh_enabled,
    assuranceOverride: row.assurance_override,
    effectiveAssurance:
      minimum === "strong" || row.assurance_override === "strong"
        ? "strong"
        : "baseline",
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    disabledAt: row.disabled_at
      ? new Date(row.disabled_at).toISOString()
      : null,
  };
}
export function validateClient(
  body: CreateClientRequest | undefined,
  minimum: Assurance,
): { ok: true; value: ClientConfig } | { ok: false; response: Response } {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return fail(400, "A child client configuration is required.");
  if (
    Object.keys(body).some(
      (key) =>
        ![
          "label",
          "clientType",
          "purpose",
          "redirectUris",
          "browserOrigins",
          "refreshEnabled",
          "assuranceOverride",
        ].includes(key),
    )
  )
    return fail(400, "Unsupported client field.");
  const errors = validateRequiredString(body.label, "label", "Label");
  if (errors.length)
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid client request.", {
        errors,
      }),
    };
  if (body.label.length > 64)
    return fail(400, "Client label must be at most 64 characters.", "label");
  if (body.clientType !== "public" && body.clientType !== "confidential")
    return fail(
      400,
      "Client type must be public or confidential.",
      "clientType",
    );
  if (body.purpose !== "interactive" && body.purpose !== "workload")
    return fail(400, "Purpose must be interactive or workload.", "purpose");
  if (
    body.refreshEnabled !== undefined &&
    typeof body.refreshEnabled !== "boolean"
  )
    return fail(400, "Refresh capability must be boolean.", "refreshEnabled");
  if (
    body.assuranceOverride !== undefined &&
    body.assuranceOverride !== null &&
    body.assuranceOverride !== "baseline" &&
    body.assuranceOverride !== "strong"
  )
    return fail(
      400,
      "Assurance override must be baseline, strong, or null.",
      "assuranceOverride",
    );
  if (minimum === "strong" && body.assuranceOverride === "baseline")
    return fail(
      400,
      "Client cannot weaken application minimum assurance.",
      "assuranceOverride",
    );
  let redirects: string[] = [];
  if (body.purpose === "interactive") {
    const redirect = validateRedirectUris(
      body.redirectUris,
      loadConfig().nodeEnv,
    );
    if (!redirect.ok)
      return {
        ok: false,
        response: problem(400, "Validation Error", "Invalid redirects.", {
          errors: redirect.errors,
        }),
      };
    redirects = redirect.uris;
  } else if (
    body.clientType !== "confidential" ||
    (body.redirectUris !== undefined &&
      (!Array.isArray(body.redirectUris) || body.redirectUris.length)) ||
    body.refreshEnabled ||
    body.assuranceOverride != null
  ) {
    return fail(
      400,
      "Workload clients must be confidential and cannot use interactive redirects, refresh, or human assurance.",
      "purpose",
    );
  }
  const origins = body.browserOrigins === undefined ? [] : body.browserOrigins;
  if (!Array.isArray(origins) || origins.length > 20)
    return fail(400, "Provide at most 20 browser origins.", "browserOrigins");
  if (
    origins.length &&
    (body.clientType !== "public" || body.purpose !== "interactive")
  )
    return fail(
      400,
      "Browser origins apply only to public interactive clients.",
      "browserOrigins",
    );
  for (const origin of origins) {
    if (typeof origin !== "string")
      return fail(
        400,
        "Each browser origin must be a string.",
        "browserOrigins",
      );
    try {
      const url = new URL(origin);
      if (
        url.origin !== origin ||
        url.username ||
        url.password ||
        !["http:", "https:"].includes(url.protocol) ||
        origin.includes("*") ||
        (url.protocol === "http:" &&
          !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      )
        throw new Error();
    } catch {
      return fail(
        400,
        "Browser origin must be an exact HTTPS origin or loopback HTTP origin, without a path.",
        "browserOrigins",
      );
    }
  }
  return {
    ok: true,
    value: {
      label: body.label.trim(),
      clientType: body.clientType,
      purpose: body.purpose,
      redirectUris: redirects,
      browserOrigins: [...new Set(origins)],
      refreshEnabled: body.refreshEnabled ?? false,
      assuranceOverride: body.assuranceOverride ?? null,
    },
  };
}
export async function insertClient(
  tx: SQL,
  appId: string,
  config: ClientConfig,
  minimum: Assurance,
): Promise<CreateClientResponse> {
  const secret = config.clientType === "confidential" ? randomToken(32) : null;
  const hash = secret ? await hashPassword(secret) : null;
  const [row] =
    await tx`INSERT INTO oauth_clients (app_id, client_id, client_secret_hash, label, client_type, purpose,
    redirect_uris, browser_origins, refresh_enabled, assurance_override)
    VALUES (${appId}, ${`z0_${randomToken(16)}`}, ${hash}, ${config.label}, ${config.clientType}, ${config.purpose},
      ${pgTextArray(config.redirectUris)}, ${pgTextArray(config.browserOrigins)}, ${config.refreshEnabled}, ${config.assuranceOverride}) RETURNING *`;
  return { client: mapClient(row as ClientRow, minimum), clientSecret: secret };
}
export async function listClientsForApi(appId: string) {
  const [app] =
    await getDb()`SELECT minimum_assurance FROM apps WHERE id = ${appId}`;
  if (!app) return fail(404, "Application not found.");
  const rows =
    await getDb()`SELECT * FROM oauth_clients WHERE app_id = ${appId} ORDER BY created_at`;
  return {
    ok: true as const,
    clients: rows.map((r: ClientRow) => mapClient(r, app.minimum_assurance)),
  };
}
export async function createClient(appId: string, body: CreateClientRequest) {
  return getDb().begin(async (tx) => {
    const [app] = await tx`SELECT * FROM apps WHERE id = ${appId} FOR UPDATE`;
    if (!app) return fail(404, "Application not found.");
    if (app.status !== "active") return fail(409, "Application is disabled.");
    const config = validateClient(body, app.minimum_assurance);
    if (!config.ok) return config;
    return {
      ok: true as const,
      data: await insertClient(tx, appId, config.value, app.minimum_assurance),
    };
  });
}
async function containClient(tx: SQL, clientId: string, refreshOnly = false) {
  if (!refreshOnly) {
    await tx`UPDATE oauth_authorization_codes SET used_at = COALESCE(used_at, NOW()) WHERE app_credential_id = ${clientId}`;
    await tx`UPDATE oauth_consent_challenges SET consumed_at = COALESCE(consumed_at, NOW()), completion_outcome = COALESCE(completion_outcome, 'expired') WHERE app_credential_id = ${clientId}`;
  }
  await tx`UPDATE oauth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()), retry_key_hash = NULL, retry_response_ciphertext = NULL, retry_expires_at = NULL WHERE app_credential_id = ${clientId}`;
}
export async function patchClient(
  appId: string,
  id: string,
  body: PatchClientRequest,
) {
  if (
    Object.keys(body).some(
      (key) =>
        ![
          "label",
          "redirectUris",
          "browserOrigins",
          "refreshEnabled",
          "assuranceOverride",
          "status",
        ].includes(key),
    )
  )
    return fail(
      400,
      "Client identity, class and purpose are immutable; unsupported field.",
    );

  if (
    body.status !== undefined &&
    body.status !== "active" &&
    body.status !== "disabled"
  )
    return fail(400, "Status must be active or disabled.", "status");
  return getDb().begin(async (tx) => {
    const [app] = await tx`SELECT * FROM apps WHERE id = ${appId} FOR UPDATE`;
    if (!app) return fail(404, "Application not found.");
    const [row] =
      await tx`SELECT * FROM oauth_clients WHERE id = ${id} AND app_id = ${appId} FOR UPDATE`;
    if (!row) return fail(404, "Client not found.");
    if (row.status === "purged" || row.status === "pending_deletion")
      return fail(409, "Client is unavailable.");
    if (app.status !== "active" && body.status === "active")
      return fail(409, "Application is disabled.");
    const config = validateClient(
      {
        label: body.label === undefined ? row.label : body.label,
        clientType: row.client_type,
        purpose: row.purpose,
        redirectUris:
          body.redirectUris === undefined
            ? row.redirect_uris
            : body.redirectUris,
        browserOrigins:
          body.browserOrigins === undefined
            ? row.browser_origins
            : body.browserOrigins,
        refreshEnabled:
          body.refreshEnabled === undefined
            ? row.refresh_enabled
            : body.refreshEnabled,
        assuranceOverride:
          body.assuranceOverride === undefined
            ? row.assurance_override
            : body.assuranceOverride,
      },
      app.minimum_assurance,
    );
    if (!config.ok) return config;
    const c = config.value;
    const status = body.status ?? row.status;
    const [updated] =
      await tx`UPDATE oauth_clients SET label = ${c.label}, redirect_uris = ${pgTextArray(c.redirectUris)},
      browser_origins = ${pgTextArray(c.browserOrigins)}, refresh_enabled = ${c.refreshEnabled}, assurance_override = ${c.assuranceOverride},
      status = ${status}, disabled_at = ${status === "disabled" ? (row.disabled_at ?? new Date()) : null}, updated_at = NOW()
      WHERE id = ${id} RETURNING *`;
    if (status === "disabled") await containClient(tx, id);
    else if (!c.refreshEnabled) await containClient(tx, id, true);
    return {
      ok: true as const,
      client: mapClient(updated as ClientRow, app.minimum_assurance),
    };
  });
}
export async function rotateClientSecret(appId: string, id: string) {
  return getDb().begin(async (tx) => {
    const [app] = await tx`SELECT * FROM apps WHERE id = ${appId} FOR UPDATE`;
    if (!app) return fail(404, "Application not found.");
    const [client] =
      await tx`SELECT * FROM oauth_clients WHERE id = ${id} AND app_id = ${appId} FOR UPDATE`;
    if (!client) return fail(404, "Client not found.");
    if (client.client_type === "public")
      return {
        ok: false as const,
        response: problem(
          409,
          "Conflict",
          "Public clients do not use secrets.",
          {
            errors: [
              {
                field: "client",
                code: "public_client_no_secret",
                message: "Public clients do not use secrets.",
              },
            ],
          },
        ),
      };
    if (app.status !== "active" || client.status !== "active")
      return fail(409, "Client is disabled.");
    const secret = randomToken(32);
    const hash = await hashPassword(secret);
    const [updated] =
      await tx`UPDATE oauth_clients SET client_secret_hash = ${hash}, updated_at = NOW() WHERE id = ${id} RETURNING *`;
    return {
      ok: true as const,
      data: {
        client: mapClient(updated as ClientRow, app.minimum_assurance),
        clientSecret: secret,
      },
    };
  });
}
