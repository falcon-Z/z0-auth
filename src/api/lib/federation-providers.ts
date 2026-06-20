import type {
  AppFederationProviderEntry,
  AppFederationSettingsResponse,
  CreateCustomIdentityProviderRequest,
  CreateIdentityProviderFromTemplateRequest,
  HostedFederationProvider,
  IdentityProviderResponse,
  PatchIdentityProviderRequest,
  PutAppFederationSettingsRequest,
} from "@z0/contracts/federation";
import { BUILTIN_PROVIDER_IDS } from "@z0/contracts/federation";
import { ErrorCodes } from "@z0/contracts/errors";

import { requestPublicOrigin } from "./config";
import { getDb, pgTextArray } from "./db";
import { problem } from "./http";
import { encryptSecret } from "./settings-crypto";
import { BUILTIN_PROVIDER_TEMPLATES, builtinTemplate } from "./federation-builtin";

type ProviderRow = {
  id: string;
  key: string;
  type: "builtin" | "custom";
  builtin_id: string | null;
  display_name: string;
  enabled: boolean;
  authorization_url: string | null;
  token_url: string | null;
  userinfo_url: string | null;
  issuer: string | null;
  jwks_url: string | null;
  default_scopes: string;
  client_id: string | null;
  client_secret_ciphertext: string | null;
  status: "active" | "disabled";
  created_at: Date;
  updated_at: Date;
};

function callbackUrlForKey(origin: string, key: string): string {
  return `${origin.replace(/\/$/, "")}/auth/federation/${encodeURIComponent(key)}/callback`;
}

function mapProviderRow(row: ProviderRow, origin: string): IdentityProviderResponse {
  return {
    id: String(row.id),
    key: row.key,
    type: row.type,
    builtinId: row.builtin_id as IdentityProviderResponse["builtinId"],
    displayName: row.display_name,
    enabled: row.enabled,
    authorizationUrl: row.authorization_url,
    tokenUrl: row.token_url,
    userinfoUrl: row.userinfo_url,
    issuer: row.issuer,
    jwksUrl: row.jwks_url,
    defaultScopes: row.default_scopes,
    clientId: row.client_id,
    hasClientSecret: Boolean(row.client_secret_ciphertext),
    status: row.status,
    callbackUrl: callbackUrlForKey(origin, row.key),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function validateProviderKey(key: string): { field: string; code: string; message: string }[] {
  const trimmed = key.trim().toLowerCase();
  if (!trimmed) {
    return [{ field: "key", code: ErrorCodes.REQUIRED, message: "Enter a provider key" }];
  }
  if (!/^[a-z0-9-]{2,32}$/.test(trimmed)) {
    return [{ field: "key", code: ErrorCodes.REQUIRED, message: "Use lowercase letters, numbers, and hyphens (2–32 chars)" }];
  }
  return [];
}

function validateHttpsUrl(value: string, field: string, label: string): { field: string; code: string; message: string }[] {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return [{ field, code: ErrorCodes.REQUIRED, message: `${label} must use http or https` }];
    }
  } catch {
    return [{ field, code: ErrorCodes.REQUIRED, message: `Enter a valid ${label.toLowerCase()}` }];
  }
  return [];
}

async function providerKeyTaken(key: string, excludeId?: string): Promise<boolean> {
  const [row] = excludeId
    ? await getDb()`
        SELECT 1 FROM identity_providers WHERE key = ${key} AND id <> ${excludeId} LIMIT 1
      `
    : await getDb()`
        SELECT 1 FROM identity_providers WHERE key = ${key} LIMIT 1
      `;
  return Boolean(row);
}

export async function listIdentityProvidersForApi(req: Request): Promise<IdentityProviderResponse[]> {
  const origin = requestPublicOrigin(req);
  const rows = await getDb()`
    SELECT *
    FROM identity_providers
    ORDER BY display_name ASC, key ASC
  `;
  return (rows as ProviderRow[]).map((row) => mapProviderRow(row, origin));
}

export async function getIdentityProviderForApi(
  req: Request,
  providerId: string,
): Promise<IdentityProviderResponse | null> {
  const origin = requestPublicOrigin(req);
  const [row] = await getDb()`
    SELECT * FROM identity_providers WHERE id = ${providerId} LIMIT 1
  `;
  if (!row) return null;
  return mapProviderRow(row as ProviderRow, origin);
}

export async function getIdentityProviderByKey(key: string): Promise<ProviderRow | null> {
  const [row] = await getDb()`
    SELECT * FROM identity_providers WHERE key = ${key.toLowerCase()} LIMIT 1
  `;
  return row ? (row as ProviderRow) : null;
}

export async function createProviderFromTemplate(
  req: Request,
  body: CreateIdentityProviderFromTemplateRequest,
): Promise<
  | { ok: true; provider: IdentityProviderResponse }
  | { ok: false; response: Response }
> {
  if (!BUILTIN_PROVIDER_IDS.includes(body.builtinId)) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid request", {
        errors: [{ field: "builtinId", code: ErrorCodes.REQUIRED, message: "Choose a supported provider" }],
      }),
    };
  }
  if (!body.clientId?.trim()) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid request", {
        errors: [{ field: "clientId", code: ErrorCodes.REQUIRED, message: "Enter the client id from the provider" }],
      }),
    };
  }
  if (!body.clientSecret?.trim()) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid request", {
        errors: [{ field: "clientSecret", code: ErrorCodes.REQUIRED, message: "Enter the client secret" }],
      }),
    };
  }

  const template = builtinTemplate(body.builtinId);
  if (await providerKeyTaken(template.key)) {
    return {
      ok: false,
      response: problem(409, "Conflict", "Provider already exists", {
        errors: [{ field: "builtinId", code: ErrorCodes.PROVIDER_KEY_TAKEN, message: "This provider is already configured" }],
      }),
    };
  }

  const secretCiphertext = await encryptSecret(body.clientSecret.trim());
  const [row] = await getDb()`
    INSERT INTO identity_providers (
      key,
      type,
      builtin_id,
      display_name,
      enabled,
      authorization_url,
      token_url,
      userinfo_url,
      issuer,
      jwks_url,
      default_scopes,
      client_id,
      client_secret_ciphertext,
      status
    )
    VALUES (
      ${template.key},
      'builtin',
      ${template.id},
      ${body.displayName?.trim() || template.displayName},
      ${body.enabled ?? false},
      ${template.authorizationUrl},
      ${template.tokenUrl},
      ${template.userinfoUrl || null},
      ${template.issuer ?? null},
      ${template.jwksUrl ?? null},
      ${template.defaultScopes},
      ${body.clientId.trim()},
      ${secretCiphertext},
      'active'
    )
    RETURNING *
  `;

  const origin = requestPublicOrigin(req);
  return { ok: true, provider: mapProviderRow(row as ProviderRow, origin) };
}

export async function createCustomProvider(
  req: Request,
  body: CreateCustomIdentityProviderRequest,
): Promise<
  | { ok: true; provider: IdentityProviderResponse }
  | { ok: false; response: Response }
> {
  const errors = [
    ...validateProviderKey(body.key),
    ...(body.displayName?.trim()
      ? []
      : [{ field: "displayName", code: ErrorCodes.REQUIRED, message: "Enter a display name" }]),
    ...validateHttpsUrl(body.authorizationUrl, "authorizationUrl", "Authorization URL"),
    ...validateHttpsUrl(body.tokenUrl, "tokenUrl", "Token URL"),
    ...validateHttpsUrl(body.userinfoUrl, "userinfoUrl", "Userinfo URL"),
    ...(body.clientId?.trim()
      ? []
      : [{ field: "clientId", code: ErrorCodes.REQUIRED, message: "Enter the client id" }]),
    ...(body.clientSecret?.trim()
      ? []
      : [{ field: "clientSecret", code: ErrorCodes.REQUIRED, message: "Enter the client secret" }]),
  ];
  if (errors.length) {
    return { ok: false, response: problem(400, "Validation Error", "Invalid request", { errors }) };
  }

  const key = body.key.trim().toLowerCase();
  if (await providerKeyTaken(key)) {
    return {
      ok: false,
      response: problem(409, "Conflict", "Provider key already in use", {
        errors: [{ field: "key", code: ErrorCodes.PROVIDER_KEY_TAKEN, message: "This key is already in use" }],
      }),
    };
  }

  const secretCiphertext = await encryptSecret(body.clientSecret.trim());
  const [row] = await getDb()`
    INSERT INTO identity_providers (
      key,
      type,
      display_name,
      enabled,
      authorization_url,
      token_url,
      userinfo_url,
      issuer,
      jwks_url,
      default_scopes,
      client_id,
      client_secret_ciphertext,
      status
    )
    VALUES (
      ${key},
      'custom',
      ${body.displayName.trim()},
      ${body.enabled ?? false},
      ${body.authorizationUrl.trim()},
      ${body.tokenUrl.trim()},
      ${body.userinfoUrl.trim()},
      ${body.issuer?.trim() || null},
      ${body.jwksUrl?.trim() || null},
      ${body.defaultScopes?.trim() ?? ""},
      ${body.clientId.trim()},
      ${secretCiphertext},
      'active'
    )
    RETURNING *
  `;

  const origin = requestPublicOrigin(req);
  return { ok: true, provider: mapProviderRow(row as ProviderRow, origin) };
}

export async function patchIdentityProvider(
  req: Request,
  providerId: string,
  body: PatchIdentityProviderRequest,
): Promise<
  | { ok: true; provider: IdentityProviderResponse }
  | { ok: false; response: Response }
> {
  const existing = await getIdentityProviderForApi(req, providerId);
  if (!existing) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Provider not found", {
        errors: [{ field: "providerId", code: ErrorCodes.PROVIDER_NOT_FOUND, message: "Provider not found" }],
      }),
    };
  }

  const errors: { field: string; code: string; message: string }[] = [];
  if (body.authorizationUrl !== undefined) errors.push(...validateHttpsUrl(body.authorizationUrl, "authorizationUrl", "Authorization URL"));
  if (body.tokenUrl !== undefined) errors.push(...validateHttpsUrl(body.tokenUrl, "tokenUrl", "Token URL"));
  if (body.userinfoUrl !== undefined) errors.push(...validateHttpsUrl(body.userinfoUrl, "userinfoUrl", "Userinfo URL"));
  if (errors.length) {
    return { ok: false, response: problem(400, "Validation Error", "Invalid request", { errors }) };
  }

  const secretCiphertext =
    body.clientSecret?.trim() ? await encryptSecret(body.clientSecret.trim()) : undefined;

  await getDb()`
    UPDATE identity_providers
    SET
      display_name = COALESCE(${body.displayName?.trim() ?? null}, display_name),
      enabled = COALESCE(${body.enabled ?? null}, enabled),
      authorization_url = COALESCE(${body.authorizationUrl?.trim() ?? null}, authorization_url),
      token_url = COALESCE(${body.tokenUrl?.trim() ?? null}, token_url),
      userinfo_url = COALESCE(${body.userinfoUrl?.trim() ?? null}, userinfo_url),
      issuer = CASE WHEN ${body.issuer !== undefined} THEN ${body.issuer?.trim() || null} ELSE issuer END,
      jwks_url = CASE WHEN ${body.jwksUrl !== undefined} THEN ${body.jwksUrl?.trim() || null} ELSE jwks_url END,
      default_scopes = COALESCE(${body.defaultScopes?.trim() ?? null}, default_scopes),
      client_id = COALESCE(${body.clientId?.trim() ?? null}, client_id),
      client_secret_ciphertext = COALESCE(${secretCiphertext ?? null}, client_secret_ciphertext),
      status = COALESCE(${body.status ?? null}, status),
      updated_at = NOW()
    WHERE id = ${providerId}
  `;

  const provider = await getIdentityProviderForApi(req, providerId);
  return { ok: true, provider: provider! };
}

export async function deleteIdentityProvider(providerId: string): Promise<Response | null> {
  const [usage] = await getDb()`
    SELECT 1
    FROM app_identity_providers
    WHERE identity_provider_id = ${providerId} AND enabled = true
    LIMIT 1
  `;
  if (usage) {
    return problem(409, "Conflict", "Provider is enabled on one or more apps", {
      errors: [{ field: "providerId", code: ErrorCodes.PROVIDER_IN_USE, message: "Disable this provider on all apps first" }],
    });
  }

  const result = await getDb()`
    DELETE FROM identity_providers WHERE id = ${providerId}
  `;
  if (result.count === 0) {
    return problem(404, "Not Found", "Provider not found", {
      errors: [{ field: "providerId", code: ErrorCodes.PROVIDER_NOT_FOUND, message: "Provider not found" }],
    });
  }
  return null;
}

export async function getAppFederationSettingsForApi(
  req: Request,
  appId: string,
): Promise<AppFederationSettingsResponse | null> {
  const origin = requestPublicOrigin(req);
  const [appRow] = await getDb()`SELECT id FROM apps WHERE id = ${appId} LIMIT 1`;
  if (!appRow) return null;

  const providers = await listIdentityProvidersForApi(req);
  const enabledRows = await getDb()`
    SELECT identity_provider_id, enabled, requested_scopes, sort_order, updated_at
    FROM app_identity_providers
    WHERE app_id = ${appId}
  `;
  const byProvider = new Map(
    (enabledRows as { identity_provider_id: string; enabled: boolean; requested_scopes: string | null; sort_order: number; updated_at: Date }[]).map(
      (row) => [String(row.identity_provider_id), row],
    ),
  );

  let latestUpdated: Date | null = null;
  const entries: AppFederationProviderEntry[] = providers.map((provider) => {
    const appRow = byProvider.get(provider.id);
    if (appRow?.updated_at && (!latestUpdated || appRow.updated_at > latestUpdated)) {
      latestUpdated = appRow.updated_at;
    }
    return {
      providerId: provider.id,
      key: provider.key,
      displayName: provider.displayName,
      instanceEnabled: provider.enabled && provider.status === "active",
      appEnabled: Boolean(appRow?.enabled),
      requestedScopes: appRow?.requested_scopes ?? null,
      sortOrder: appRow?.sort_order ?? 0,
    };
  });

  entries.sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName));

  return {
    appId,
    providers: entries,
    updatedAt: latestUpdated ? new Date(latestUpdated).toISOString() : null,
  };
}

export async function putAppFederationSettings(
  req: Request,
  appId: string,
  body: PutAppFederationSettingsRequest,
): Promise<
  | { ok: true; settings: AppFederationSettingsResponse }
  | { ok: false; response: Response }
> {
  const [appRow] = await getDb()`SELECT id FROM apps WHERE id = ${appId} LIMIT 1`;
  if (!appRow) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Application not found", {
        errors: [{ field: "appId", code: ErrorCodes.APP_NOT_FOUND, message: "Application not found" }],
      }),
    };
  }

  const providerIds = body.providers?.map((p) => p.providerId) ?? [];
  if (providerIds.length !== new Set(providerIds).size) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid request", {
        errors: [{ field: "providers", code: ErrorCodes.REQUIRED, message: "Each provider can only appear once" }],
      }),
    };
  }

  if (providerIds.length) {
    const rows = await getDb()`
      SELECT id FROM identity_providers WHERE id = ANY(${pgTextArray(providerIds)}::uuid[])
    `;
    if (rows.length !== providerIds.length) {
      return {
        ok: false,
        response: problem(400, "Validation Error", "Invalid request", {
          errors: [{ field: "providers", code: ErrorCodes.PROVIDER_NOT_FOUND, message: "One or more providers were not found" }],
        }),
      };
    }
  }

  await getDb()`DELETE FROM app_identity_providers WHERE app_id = ${appId}`;

  for (const entry of body.providers ?? []) {
    if (!entry.enabled) continue;
    await getDb()`
      INSERT INTO app_identity_providers (
        app_id,
        identity_provider_id,
        enabled,
        requested_scopes,
        sort_order
      )
      VALUES (
        ${appId},
        ${entry.providerId},
        true,
        ${entry.requestedScopes?.trim() || null},
        ${entry.sortOrder ?? 0}
      )
    `;
  }

  const settings = await getAppFederationSettingsForApi(req, appId);
  return { ok: true, settings: settings! };
}

export async function listHostedFederationProviders(
  appId: string,
  clientId: string,
  returnTo?: string,
): Promise<HostedFederationProvider[]> {
  const rows = await getDb()`
    SELECT ip.key, ip.display_name, aip.sort_order
    FROM app_identity_providers aip
    JOIN identity_providers ip ON ip.id = aip.identity_provider_id
    WHERE aip.app_id = ${appId}
      AND aip.enabled = true
      AND ip.enabled = true
      AND ip.status = 'active'
      AND ip.client_id IS NOT NULL
      AND ip.client_secret_ciphertext IS NOT NULL
    ORDER BY aip.sort_order ASC, ip.display_name ASC
  `;

  return (rows as { key: string; display_name: string }[]).map((row) => {
    const params = new URLSearchParams({ client_id: clientId });
    if (returnTo) params.set("return_to", returnTo);
    return {
      key: row.key,
      displayName: row.display_name,
      startUrl: `/auth/federation/${encodeURIComponent(row.key)}/start?${params.toString()}`,
    };
  });
}

export function listAvailableBuiltinTemplates() {
  return BUILTIN_PROVIDER_IDS.map((id) => BUILTIN_PROVIDER_TEMPLATES[id]);
}

export type ProviderSecrets = {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string | null;
  defaultScopes: string;
  builtinId: string | null;
};

export async function getProviderSecrets(providerId: string): Promise<ProviderSecrets | null> {
  const [row] = await getDb()`
    SELECT
      client_id,
      client_secret_ciphertext,
      authorization_url,
      token_url,
      userinfo_url,
      default_scopes,
      builtin_id
    FROM identity_providers
    WHERE id = ${providerId}
      AND status = 'active'
      AND enabled = true
    LIMIT 1
  `;
  if (!row) return null;
  const r = row as {
    client_id: string | null;
    client_secret_ciphertext: string | null;
    authorization_url: string | null;
    token_url: string | null;
    userinfo_url: string | null;
    default_scopes: string;
    builtin_id: string | null;
  };
  if (!r.client_id || !r.client_secret_ciphertext || !r.authorization_url || !r.token_url) return null;

  const { decryptSecret } = await import("./settings-crypto");
  const clientSecret = await decryptSecret(r.client_secret_ciphertext);
  return {
    clientId: r.client_id,
    clientSecret,
    authorizationUrl: r.authorization_url,
    tokenUrl: r.token_url,
    userinfoUrl: r.userinfo_url,
    defaultScopes: r.default_scopes,
    builtinId: r.builtin_id,
  };
}

export async function isProviderEnabledForApp(appId: string, providerKey: string): Promise<ProviderRow | null> {
  const [row] = await getDb()`
    SELECT ip.*
    FROM identity_providers ip
    JOIN app_identity_providers aip ON aip.identity_provider_id = ip.id
    WHERE ip.key = ${providerKey.toLowerCase()}
      AND aip.app_id = ${appId}
      AND aip.enabled = true
      AND ip.enabled = true
      AND ip.status = 'active'
    LIMIT 1
  `;
  return row ? (row as ProviderRow) : null;
}

export { callbackUrlForKey };
