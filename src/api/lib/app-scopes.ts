import type {
  AppScopeSummary,
  CreateAppScopeRequest,
  PatchAppScopeRequest,
} from "@z0/contracts/app-scopes";
import { ErrorCodes } from "@z0/contracts/errors";

import { getDb } from "./db";
import { problem } from "./http";
import { findAppRow } from "./apps";
import {
  normalizeScopeName,
  validateScopeDescription,
  validateScopeName,
} from "./scope-names";

type ScopeRow = {
  id: string;
  app_id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapScopeRow(row: ScopeRow): AppScopeSummary {
  return {
    id: String(row.id),
    appId: String(row.app_id),
    name: row.name,
    description: row.description,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function isUniqueScopeViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { errno?: string }).errno;
  return code === "23505" || error.message.toLowerCase().includes("unique");
}

async function appNotFoundResponse(): Promise<Response> {
  return problem(404, "Not Found", "Application not found.", {
    errors: [{ field: "appId", code: ErrorCodes.APP_NOT_FOUND, message: "Application not found" }],
  });
}

async function findScopeRow(appId: string, scopeId: string): Promise<ScopeRow | null> {
  const [row] = await getDb()`
    SELECT id, app_id, name, description, created_at, updated_at
    FROM app_scopes
    WHERE app_id = ${appId}
      AND id = ${scopeId}
  `;
  if (!row) return null;
  const r = row as ScopeRow;
  return {
    ...r,
    id: String(r.id),
    app_id: String(r.app_id),
    description: r.description ?? null,
    created_at: new Date(r.created_at),
    updated_at: new Date(r.updated_at),
  };
}

export async function listScopesForApi(
  appId: string,
): Promise<{ ok: true; scopes: AppScopeSummary[] } | { ok: false; response: Response }> {
  const app = await findAppRow(appId);
  if (!app) return { ok: false, response: await appNotFoundResponse() };

  const rows = await getDb()`
    SELECT id, app_id, name, description, created_at, updated_at
    FROM app_scopes
    WHERE app_id = ${appId}
    ORDER BY name ASC
  `;

  return {
    ok: true,
    scopes: (rows as ScopeRow[]).map((row) =>
      mapScopeRow({
        ...row,
        id: String(row.id),
        app_id: String(row.app_id),
        description: row.description ?? null,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
      }),
    ),
  };
}

export async function createScopeForApi(
  appId: string,
  body: CreateAppScopeRequest,
): Promise<{ ok: true; scope: AppScopeSummary } | { ok: false; response: Response }> {
  const app = await findAppRow(appId);
  if (!app) return { ok: false, response: await appNotFoundResponse() };

  const nameErrors = validateScopeName(body.name);
  const descriptionErrors = validateScopeDescription(body.description);
  const errors = [...nameErrors, ...descriptionErrors];
  if (errors.length > 0) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid scope request.", { errors }),
    };
  }

  const name = normalizeScopeName(body.name);
  const description =
    body.description === undefined || body.description === null
      ? null
      : body.description.trim() || null;

  try {
    const [inserted] = await getDb()`
      INSERT INTO app_scopes (app_id, name, description)
      VALUES (${appId}, ${name}, ${description})
      RETURNING id, app_id, name, description, created_at, updated_at
    `;
    const row = inserted as ScopeRow;
    return {
      ok: true,
      scope: mapScopeRow({
        ...row,
        id: String(row.id),
        app_id: String(row.app_id),
        description: row.description ?? null,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
      }),
    };
  } catch (error) {
    if (isUniqueScopeViolation(error)) {
      return {
        ok: false,
        response: problem(409, "Conflict", "Scope already exists for this application.", {
          errors: [
            {
              field: "name",
              code: ErrorCodes.SCOPE_TAKEN,
              message: "This scope name is already registered",
            },
          ],
        }),
      };
    }
    throw error;
  }
}

export async function patchScopeForApi(
  appId: string,
  scopeId: string,
  body: PatchAppScopeRequest,
): Promise<{ ok: true; scope: AppScopeSummary } | { ok: false; response: Response }> {
  const app = await findAppRow(appId);
  if (!app) return { ok: false, response: await appNotFoundResponse() };

  const existing = await findScopeRow(appId, scopeId);
  if (!existing) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Scope not found.", {
        errors: [{ field: "scopeId", code: ErrorCodes.SCOPE_NOT_FOUND, message: "Scope not found" }],
      }),
    };
  }

  if (body.name === undefined && body.description === undefined) {
    return { ok: true, scope: mapScopeRow(existing) };
  }

  const errors: ReturnType<typeof validateScopeName> = [];
  if (body.name !== undefined) errors.push(...validateScopeName(body.name));
  if (body.description !== undefined) errors.push(...validateScopeDescription(body.description));
  if (errors.length > 0) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid scope request.", { errors }),
    };
  }

  const name = body.name === undefined ? existing.name : normalizeScopeName(body.name);
  const description =
    body.description === undefined
      ? existing.description
      : body.description === null
        ? null
        : body.description.trim() || null;

  try {
    const [updated] = await getDb()`
      UPDATE app_scopes
      SET name = ${name},
          description = ${description},
          updated_at = NOW()
      WHERE id = ${scopeId}
        AND app_id = ${appId}
      RETURNING id, app_id, name, description, created_at, updated_at
    `;
    const row = updated as ScopeRow;
    return {
      ok: true,
      scope: mapScopeRow({
        ...row,
        id: String(row.id),
        app_id: String(row.app_id),
        description: row.description ?? null,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
      }),
    };
  } catch (error) {
    if (isUniqueScopeViolation(error)) {
      return {
        ok: false,
        response: problem(409, "Conflict", "Scope already exists for this application.", {
          errors: [
            {
              field: "name",
              code: ErrorCodes.SCOPE_TAKEN,
              message: "This scope name is already registered",
            },
          ],
        }),
      };
    }
    throw error;
  }
}

export async function deleteScopeForApi(
  appId: string,
  scopeId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const app = await findAppRow(appId);
  if (!app) return { ok: false, response: await appNotFoundResponse() };

  const [deleted] = await getDb()`
    DELETE FROM app_scopes
    WHERE app_id = ${appId}
      AND id = ${scopeId}
    RETURNING id
  `;
  if (!deleted) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Scope not found.", {
        errors: [{ field: "scopeId", code: ErrorCodes.SCOPE_NOT_FOUND, message: "Scope not found" }],
      }),
    };
  }
  return { ok: true };
}
