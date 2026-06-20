import type {
  AppClientType,
  AppCredentialSummary,
  AppDetail,
  AppSummary,
  CreateAppRequest,
  CreateAppResponse,
  CreateCredentialRequest,
  CreateCredentialResponse,
  PatchAppRequest,
  RotateCredentialResponse,
} from "@z0/contracts/apps";
import { ErrorCodes } from "@z0/contracts/errors";
import { validateRequiredString } from "@z0/contracts/validation";

import { loadConfig } from "./config";
import { randomToken } from "./crypto";
import { seedDefaultOidcScopesForApp } from "./default-app-scopes";
import { getDb, pgTextArray } from "./db";
import { problem } from "./http";
import { hashPassword } from "./password";
import { validateRedirectUris } from "./redirect-uris";
import { isValidSlug, slugifyAppName } from "./slug";

type AppRow = {
  id: string;
  name: string;
  slug: string;
  client_type: string;
  redirect_uris: string[];
  status: string;
  disabled_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type CredentialRow = {
  id: string;
  app_id: string;
  client_id: string;
  client_secret_hash: string | null;
  label: string;
  status: string;
  revoked_at: Date | null;
  created_at: Date;
};

function mapAppRow(row: AppRow, activeCredentialCount: number): AppSummary {
  return {
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    clientType: row.client_type as AppClientType,
    status: row.status as AppSummary["status"],
    redirectUris: row.redirect_uris ?? [],
    activeCredentialCount,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    disabledAt: row.disabled_at ? row.disabled_at.toISOString() : null,
  };
}

function mapCredentialRow(row: CredentialRow): AppCredentialSummary {
  return {
    id: String(row.id),
    clientId: row.client_id,
    label: row.label,
    status: row.status as AppCredentialSummary["status"],
    createdAt: row.created_at.toISOString(),
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
  };
}

async function countActiveCredentials(appId: string): Promise<number> {
  const [row] = await getDb()`
    SELECT COUNT(*)::int AS count
    FROM app_credentials
    WHERE app_id = ${appId}
      AND status = 'active'
  `;
  return Number((row as { count: number }).count ?? 0);
}

async function reserveUniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  while (true) {
    const [existing] = await getDb()`SELECT 1 FROM apps WHERE slug = ${candidate} LIMIT 1`;
    if (!existing) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
  }
}

export async function findAppRow(appId: string): Promise<AppRow | null> {
  const [row] = await getDb()`
    SELECT id, name, slug, client_type, redirect_uris, status, disabled_at, created_at, updated_at
    FROM apps
    WHERE id = ${appId}
  `;
  if (!row) return null;
  const r = row as AppRow;
  return {
    ...r,
    id: String(r.id),
    redirect_uris: (r.redirect_uris as string[]) ?? [],
    disabled_at: r.disabled_at ? new Date(r.disabled_at) : null,
    created_at: new Date(r.created_at),
    updated_at: new Date(r.updated_at),
  };
}

function newClientId(): string {
  return `z0_${randomToken(16)}`;
}

function newClientSecret(): string {
  return randomToken(32);
}

function isUniqueSlugViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { errno?: string }).errno;
  return code === "23505" || error.message.toLowerCase().includes("unique");
}

export async function listAppsForApi(): Promise<AppSummary[]> {
  const rows = await getDb()`
    SELECT
      a.id,
      a.name,
      a.slug,
      a.client_type,
      a.redirect_uris,
      a.status,
      a.disabled_at,
      a.created_at,
      a.updated_at,
      COUNT(c.id) FILTER (WHERE c.status = 'active')::int AS active_credential_count
    FROM apps a
    LEFT JOIN app_credentials c ON c.app_id = a.id
    GROUP BY a.id
    ORDER BY a.created_at ASC
  `;
  return (rows as (AppRow & { active_credential_count: number })[]).map((row) =>
    mapAppRow(
      {
        ...row,
        id: String(row.id),
        redirect_uris: (row.redirect_uris as string[]) ?? [],
        disabled_at: row.disabled_at ? new Date(row.disabled_at) : null,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
      },
      Number(row.active_credential_count ?? 0),
    ),
  );
}

export async function getAppForApi(appId: string): Promise<
  { ok: true; app: AppDetail } | { ok: false; response: Response }
> {
  const row = await findAppRow(appId);
  if (!row) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Application not found.", {
        errors: [{ field: "appId", code: ErrorCodes.APP_NOT_FOUND, message: "Application not found" }],
      }),
    };
  }
  const count = await countActiveCredentials(appId);
  return { ok: true, app: mapAppRow(row, count) };
}

function validateClientType(value: unknown): { ok: true; clientType: AppClientType } | { ok: false; response: Response } {
  if (value !== "public" && value !== "confidential") {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid application request.", {
        errors: [
          {
            field: "clientType",
            code: ErrorCodes.REQUIRED,
            message: "Client type must be public or confidential",
          },
        ],
      }),
    };
  }
  return { ok: true, clientType: value };
}

async function insertCredential(
  appId: string,
  clientType: AppClientType,
  label: string,
): Promise<CreateCredentialResponse> {
  const clientId = newClientId();
  let clientSecret: string | null = null;
  let clientSecretHash: string | null = null;
  if (clientType === "confidential") {
    clientSecret = newClientSecret();
    clientSecretHash = await hashPassword(clientSecret);
  }

  const [inserted] = await getDb()`
    INSERT INTO app_credentials (app_id, client_id, client_secret_hash, label)
    VALUES (${appId}, ${clientId}, ${clientSecretHash}, ${label})
    RETURNING id, app_id, client_id, client_secret_hash, label, status, revoked_at, created_at
  `;

  const row = inserted as CredentialRow;
  return {
    credential: mapCredentialRow({
      ...row,
      id: String(row.id),
      app_id: String(row.app_id),
      revoked_at: null,
      created_at: new Date(row.created_at),
    }),
    clientSecret,
  };
}

export async function createApp(
  body: CreateAppRequest,
): Promise<{ ok: true; data: CreateAppResponse } | { ok: false; response: Response }> {
  const config = loadConfig();
  const nameErrors = validateRequiredString(body.name, "name", "Name");
  if (nameErrors.length > 0) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid application request.", { errors: nameErrors }),
    };
  }

  const clientTypeResult = validateClientType(body.clientType);
  if (!clientTypeResult.ok) return clientTypeResult;

  const redirect = validateRedirectUris(body.redirectUris, config.nodeEnv);
  if (!redirect.ok) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid application request.", { errors: redirect.errors }),
    };
  }

  const baseSlug = slugifyAppName(body.name);
  if (!isValidSlug(baseSlug)) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid application request.", {
        errors: [{ field: "name", code: ErrorCodes.INVALID_SLUG, message: "Name cannot be turned into a valid slug" }],
      }),
    };
  }

  const name = body.name.trim();
  let slug = await reserveUniqueSlug(baseSlug);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const clientId = newClientId();
      let clientSecret: string | null = null;
      let clientSecretHash: string | null = null;
      if (clientTypeResult.clientType === "confidential") {
        clientSecret = newClientSecret();
        clientSecretHash = await hashPassword(clientSecret);
      }

      const data = await getDb().begin(async (tx) => {
        const [inserted] = await tx`
          INSERT INTO apps (name, slug, client_type, redirect_uris)
          VALUES (${name}, ${slug}, ${clientTypeResult.clientType}, ${pgTextArray(redirect.uris)})
          RETURNING id, name, slug, client_type, redirect_uris, status, disabled_at, created_at, updated_at
        `;

        const row = inserted as AppRow;
        const appId = String(row.id);

        const [credInserted] = await tx`
          INSERT INTO app_credentials (app_id, client_id, client_secret_hash, label)
          VALUES (${appId}, ${clientId}, ${clientSecretHash}, ${"Default"})
          RETURNING id, app_id, client_id, client_secret_hash, label, status, revoked_at, created_at
        `;

        const credRow = credInserted as CredentialRow;
        await seedDefaultOidcScopesForApp(tx, appId);
        return {
          app: mapAppRow(
            {
              ...row,
              id: appId,
              redirect_uris: (row.redirect_uris as string[]) ?? [],
              disabled_at: null,
              created_at: new Date(row.created_at),
              updated_at: new Date(row.updated_at),
            },
            1,
          ),
          credential: mapCredentialRow({
            ...credRow,
            id: String(credRow.id),
            app_id: String(credRow.app_id),
            revoked_at: null,
            created_at: new Date(credRow.created_at),
          }),
          clientSecret,
        };
      });

      return { ok: true, data };
    } catch (error) {
      if (attempt < 4 && isUniqueSlugViolation(error)) {
        slug = await reserveUniqueSlug(baseSlug);
        continue;
      }
      throw error;
    }
  }

  return {
    ok: false,
    response: problem(409, "Conflict", "Could not allocate a unique application slug.", {
      errors: [{ field: "name", code: ErrorCodes.SLUG_TAKEN, message: "Slug is already in use" }],
    }),
  };
}

export async function patchApp(
  appId: string,
  body: PatchAppRequest,
): Promise<{ ok: true; app: AppDetail } | { ok: false; response: Response }> {
  const existing = await findAppRow(appId);
  if (!existing) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Application not found.", {
        errors: [{ field: "appId", code: ErrorCodes.APP_NOT_FOUND, message: "Application not found" }],
      }),
    };
  }

  const config = loadConfig();
  let name = existing.name;
  let redirectUris = existing.redirect_uris;
  let status = existing.status as PatchAppRequest["status"];
  let disabledAt = existing.disabled_at;

  if (body.name !== undefined) {
    const nameErrors = validateRequiredString(body.name, "name", "Name");
    if (nameErrors.length > 0) {
      return {
        ok: false,
        response: problem(400, "Validation Error", "Invalid application request.", { errors: nameErrors }),
      };
    }
    name = body.name.trim();
  }

  if (body.redirectUris !== undefined) {
    const redirect = validateRedirectUris(body.redirectUris, config.nodeEnv);
    if (!redirect.ok) {
      return {
        ok: false,
        response: problem(400, "Validation Error", "Invalid application request.", { errors: redirect.errors }),
      };
    }
    redirectUris = redirect.uris;
  }

  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "disabled") {
      return {
        ok: false,
        response: problem(400, "Validation Error", "Invalid application request.", {
          errors: [{ field: "status", code: ErrorCodes.REQUIRED, message: "Status must be active or disabled" }],
        }),
      };
    }
    status = body.status;
    disabledAt = body.status === "disabled" ? new Date() : null;
  }

  const [updated] = await getDb()`
    UPDATE apps
    SET name = ${name},
        redirect_uris = ${pgTextArray(redirectUris)},
        status = ${status},
        disabled_at = ${disabledAt},
        updated_at = NOW()
    WHERE id = ${appId}
    RETURNING id, name, slug, client_type, redirect_uris, status, disabled_at, created_at, updated_at
  `;

  const row = updated as AppRow;
  const count = await countActiveCredentials(appId);
  return {
    ok: true,
    app: mapAppRow(
      {
        ...row,
        id: String(row.id),
        redirect_uris: (row.redirect_uris as string[]) ?? [],
        disabled_at: row.disabled_at ? new Date(row.disabled_at) : null,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
      },
      count,
    ),
  };
}

async function requireActiveApp(appId: string): Promise<
  { ok: true; row: AppRow } | { ok: false; response: Response }
> {
  const row = await findAppRow(appId);
  if (!row) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Application not found.", {
        errors: [{ field: "appId", code: ErrorCodes.APP_NOT_FOUND, message: "Application not found" }],
      }),
    };
  }
  if (row.status === "disabled") {
    return {
      ok: false,
      response: problem(409, "Conflict", "Application is disabled.", {
        errors: [{ field: "appId", code: ErrorCodes.APP_DISABLED, message: "Application is disabled" }],
      }),
    };
  }
  return { ok: true, row };
}

export async function listCredentialsForApi(appId: string): Promise<
  { ok: true; credentials: AppCredentialSummary[] } | { ok: false; response: Response }
> {
  const app = await getAppForApi(appId);
  if (!app.ok) return app;

  const rows = await getDb()`
    SELECT id, app_id, client_id, client_secret_hash, label, status, revoked_at, created_at
    FROM app_credentials
    WHERE app_id = ${appId}
    ORDER BY created_at ASC
  `;

  return {
    ok: true,
    credentials: (rows as CredentialRow[]).map((row) =>
      mapCredentialRow({
        ...row,
        id: String(row.id),
        app_id: String(row.app_id),
        revoked_at: row.revoked_at ? new Date(row.revoked_at) : null,
        created_at: new Date(row.created_at),
      }),
    ),
  };
}

export async function createCredential(
  appId: string,
  body: CreateCredentialRequest,
): Promise<{ ok: true; data: CreateCredentialResponse } | { ok: false; response: Response }> {
  const app = await requireActiveApp(appId);
  if (!app.ok) return app;

  if (app.row.client_type === "public") {
    try {
      const data = await getDb().begin(async (tx) => {
        await tx`SELECT id FROM apps WHERE id = ${appId} FOR UPDATE`;
        const [countRow] = await tx`
          SELECT COUNT(*)::int AS count
          FROM app_credentials
          WHERE app_id = ${appId}
            AND status = 'active'
        `;
        if (Number((countRow as { count: number }).count ?? 0) >= 1) {
          throw new Error("credential_limit_reached");
        }
        const label =
          typeof body.label === "string" && body.label.trim()
            ? body.label.trim().slice(0, 64)
            : "Default";
        const clientId = newClientId();
        const [inserted] = await tx`
          INSERT INTO app_credentials (app_id, client_id, client_secret_hash, label)
          VALUES (${appId}, ${clientId}, ${null}, ${label})
          RETURNING id, app_id, client_id, client_secret_hash, label, status, revoked_at, created_at
        `;
        const credRow = inserted as CredentialRow;
        return {
          credential: mapCredentialRow({
            ...credRow,
            id: String(credRow.id),
            app_id: String(credRow.app_id),
            revoked_at: null,
            created_at: new Date(credRow.created_at),
          }),
          clientSecret: null as string | null,
        };
      });
      return { ok: true, data };
    } catch (error) {
      if (error instanceof Error && error.message === "credential_limit_reached") {
        return {
          ok: false,
          response: problem(409, "Conflict", "Public applications allow only one client credential.", {
            errors: [
              {
                field: "credential",
                code: ErrorCodes.CREDENTIAL_LIMIT_REACHED,
                message: "Public applications allow only one client credential",
              },
            ],
          }),
        };
      }
      throw error;
    }
  }

  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, 64)
      : "Default";

  const data = await insertCredential(appId, app.row.client_type as AppClientType, label);
  return { ok: true, data };
}

async function findCredential(appId: string, credentialId: string): Promise<CredentialRow | null> {
  const [row] = await getDb()`
    SELECT id, app_id, client_id, client_secret_hash, label, status, revoked_at, created_at
    FROM app_credentials
    WHERE id = ${credentialId}
      AND app_id = ${appId}
  `;
  if (!row) return null;
  const r = row as CredentialRow;
  return {
    ...r,
    id: String(r.id),
    app_id: String(r.app_id),
    revoked_at: r.revoked_at ? new Date(r.revoked_at) : null,
    created_at: new Date(r.created_at),
  };
}

export async function revokeCredential(
  appId: string,
  credentialId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const app = await getAppForApi(appId);
  if (!app.ok) return app;

  const cred = await findCredential(appId, credentialId);
  if (!cred) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Credential not found.", {
        errors: [
          { field: "credentialId", code: ErrorCodes.CREDENTIAL_NOT_FOUND, message: "Credential not found" },
        ],
      }),
    };
  }

  if (cred.status === "revoked") {
    return { ok: true };
  }

  if (app.app.status === "active") {
    const activeCount = await countActiveCredentials(appId);
    if (activeCount <= 1) {
      return {
        ok: false,
        response: problem(409, "Conflict", "Cannot revoke the last active credential.", {
          errors: [
            {
              field: "credentialId",
              code: ErrorCodes.LAST_ACTIVE_CREDENTIAL,
              message: "An active application must keep at least one active credential",
            },
          ],
        }),
      };
    }
  }

  await getDb()`
    UPDATE app_credentials
    SET status = 'revoked', revoked_at = NOW()
    WHERE id = ${credentialId}
      AND app_id = ${appId}
  `;

  return { ok: true };
}

export async function rotateCredential(
  appId: string,
  credentialId: string,
): Promise<{ ok: true; data: RotateCredentialResponse } | { ok: false; response: Response }> {
  const app = await requireActiveApp(appId);
  if (!app.ok) return app;

  if (app.row.client_type === "public") {
    return {
      ok: false,
      response: problem(409, "Conflict", "Public clients do not use client secrets.", {
        errors: [
          {
            field: "credentialId",
            code: ErrorCodes.PUBLIC_CLIENT_NO_SECRET,
            message: "Public clients authenticate with PKCE and do not have a rotatable secret",
          },
        ],
      }),
    };
  }

  const cred = await findCredential(appId, credentialId);
  if (!cred || cred.status !== "active") {
    return {
      ok: false,
      response: problem(404, "Not Found", "Credential not found.", {
        errors: [
          { field: "credentialId", code: ErrorCodes.CREDENTIAL_NOT_FOUND, message: "Credential not found" },
        ],
      }),
    };
  }

  const clientSecret = newClientSecret();
  const clientSecretHash = await hashPassword(clientSecret);

  const [updated] = await getDb()`
    UPDATE app_credentials
    SET client_secret_hash = ${clientSecretHash}
    WHERE id = ${credentialId}
      AND app_id = ${appId}
      AND status = 'active'
    RETURNING id, app_id, client_id, client_secret_hash, label, status, revoked_at, created_at
  `;

  if (!updated) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Credential not found.", {
        errors: [
          { field: "credentialId", code: ErrorCodes.CREDENTIAL_NOT_FOUND, message: "Credential not found" },
        ],
      }),
    };
  }

  const row = updated as CredentialRow;
  return {
    ok: true,
    data: {
      credential: mapCredentialRow({
        ...row,
        id: String(row.id),
        app_id: String(row.app_id),
        revoked_at: row.revoked_at ? new Date(row.revoked_at) : null,
        created_at: new Date(row.created_at),
      }),
      clientSecret,
    },
  };
}

export async function countApps(): Promise<number> {
  const [row] = await getDb()`SELECT COUNT(*)::int AS count FROM apps WHERE status = 'active'`;
  return Number((row as { count: number }).count ?? 0);
}
