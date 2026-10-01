import type {
  CreateServiceGroupRequest,
  PatchServiceGroupRequest,
  PutServiceGroupAppsRequest,
  ServiceGroupAppSummary,
  ServiceGroupDetail,
  ServiceGroupSummary,
} from "@z0/contracts/service-groups";
import { ErrorCodes } from "@z0/contracts/errors";
import { validateRequiredString } from "@z0/contracts/validation";

import type { SQL } from "bun";

import { getDb, pgTextArray } from "./db";
import { problem } from "./http";
import { isValidSlug, slugifyAppName } from "./slug";

type GroupRow = {
  id: string;
  name: string;
  slug: string;
  sso_enabled: boolean;
  account_domain_id: string;
  boundary_locked: boolean;
  created_at: Date;
  updated_at: Date;
  app_count: number;
};

function mapSummary(row: GroupRow): ServiceGroupSummary {
  return {
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    ssoEnabled: row.sso_enabled,
    accountDomainId: String(row.account_domain_id),
    boundaryLocked: Boolean(row.boundary_locked),
    appCount: Number(row.app_count ?? 0),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function loadGroupApps(groupId: string): Promise<ServiceGroupAppSummary[]> {
  const rows: unknown[] = await getDb()`
    SELECT a.id, a.name, a.slug
    FROM service_group_apps sga
    JOIN apps a ON a.id = sga.app_id
    WHERE sga.group_id = ${groupId}
    ORDER BY a.name ASC
  `;
  return rows.map((row) => {
    const r = row as { id: string; name: string; slug: string };
    return { id: String(r.id), name: r.name, slug: r.slug };
  });
}

async function findGroupRow(groupId: string): Promise<GroupRow | null> {
  const [row] = await getDb()`
    SELECT
      g.id,
      g.name,
      g.slug,
      g.sso_enabled,
      g.account_domain_id,
      (SELECT identities_created_at IS NOT NULL FROM account_domains WHERE id = g.account_domain_id) AS boundary_locked,
      g.created_at,
      g.updated_at,
      (
        SELECT COUNT(*)::int
        FROM service_group_apps sga
        WHERE sga.group_id = g.id
      ) AS app_count
    FROM service_groups g
    WHERE g.id = ${groupId}
    LIMIT 1
  `;
  if (!row) return null;
  return row as GroupRow;
}

async function reserveUniqueSlug(baseSlug: string): Promise<string | null> {
  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? baseSlug : `${baseSlug}-${i + 1}`;
    if (!isValidSlug(candidate)) continue;
    const [existing] = await getDb()`
      SELECT id
      FROM service_groups
      WHERE slug = ${candidate}
      LIMIT 1
    `;
    if (!existing) return candidate;
  }
  return null;
}

function validateGroupName(nameRaw: string): { ok: true; name: string } | { ok: false; response: Response } {
  const errors = validateRequiredString(nameRaw, "name", "Name");
  if (errors.length) {
    return { ok: false, response: problem(400, "Validation Error", "Invalid request", { errors }) };
  }
  const name = nameRaw.trim();
  if (name.length > 80) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid request", {
        errors: [{ field: "name", code: ErrorCodes.REQUIRED, message: "Name must be 80 characters or fewer" }],
      }),
    };
  }
  return { ok: true, name };
}

async function validateAppIds(appIds: string[]): Promise<
  | { ok: true; ids: string[] }
  | { ok: false; response: Response }
> {
  if (!Array.isArray(appIds) || appIds.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim()))) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid request", {
        errors: [{ field: "appIds", code: ErrorCodes.REQUIRED, message: "appIds must be an array of application UUIDs" }],
      }),
    };
  }

  const ids = [...new Set(appIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return { ok: true, ids: [] };

  const rows: unknown[] = await getDb()`
    SELECT id, status
    FROM apps
    WHERE id = ANY(${pgTextArray(ids)}::uuid[])
  `;
  if (rows.length !== ids.length) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "One or more applications were not found", {
        errors: [{ field: "appIds", code: ErrorCodes.APP_NOT_FOUND, message: "Unknown application id" }],
      }),
    };
  }

  for (const row of rows) {
    if ((row as { status: string }).status !== "active") {
      return {
        ok: false,
        response: problem(400, "Validation Error", "Disabled applications cannot join a group", {
          errors: [{ field: "appIds", code: ErrorCodes.APP_DISABLED, message: "Application is disabled" }],
        }),
      };
    }
  }

  return { ok: true, ids };
}

async function assertAppsNotInOtherGroup(
  appIds: string[],
  groupId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (appIds.length === 0) return { ok: true };

  const [conflict] = await getDb()`
    SELECT a.name, sg.name AS group_name
    FROM service_group_apps sga
    JOIN apps a ON a.id = sga.app_id
    JOIN service_groups sg ON sg.id = sga.group_id
    WHERE sga.app_id = ANY(${pgTextArray(appIds)}::uuid[])
      AND sga.group_id <> ${groupId}
    LIMIT 1
  `;
  if (!conflict) return { ok: true };

  const c = conflict as { name: string; group_name: string };
  return {
    ok: false,
    response: problem(409, "Conflict", "Application already belongs to another group", {
      code: ErrorCodes.APP_ALREADY_GROUPED,
      errors: [{
        field: "appIds",
        code: ErrorCodes.APP_ALREADY_GROUPED,
        message: `${c.name} is already in ${c.group_name}`,
      }],
    }),
  };
}

async function assignAppsToGroup(tx: SQL, groupId: string, appIds: string[]): Promise<void> {
  // Retain unchanged associations: a no-op must work for populated groups.
  await tx`DELETE FROM service_group_apps WHERE group_id = ${groupId}
    AND NOT (app_id = ANY(${pgTextArray(appIds)}::uuid[]))`;
  for (const appId of [...appIds].sort()) {
    await tx`SELECT id FROM apps WHERE id = ${appId} FOR UPDATE`;
    const [association] = await tx`SELECT group_id FROM service_group_apps WHERE app_id = ${appId}`;
    if (association) {
      if (String(association.group_id) !== groupId) throw new Error("APP_ALREADY_GROUPED");
      continue;
    }
    await tx`INSERT INTO service_group_apps (group_id, app_id) VALUES (${groupId}, ${appId})`;
  }
}

function groupMutationError(error: unknown): { ok: false; response: Response } {
  const code = (error as { errno?: string; code?: string }).errno ?? (error as { code?: string }).code;
  if (code === "23514") return { ok: false, response: problem(409, "Conflict",
    "Account-domain placement cannot change after identities exist in Alpha", {
      code: ErrorCodes.ACCOUNT_DOMAIN_IMMUTABLE,
      errors: [{ field: "appIds", code: ErrorCodes.ACCOUNT_DOMAIN_IMMUTABLE,
        message: "Populated identity domains cannot join, leave, move, or be deleted." }],
    }) };
  if (code === "23505" || code === "40001" || code === "40P01" || (error as Error).message === "APP_ALREADY_GROUPED") {
    return { ok: false, response: problem(409, "Conflict", "Group configuration changed; reload and retry") };
  }
  throw error;
}

export async function listServiceGroupsForApi(): Promise<ServiceGroupSummary[]> {
  const rows: unknown[] = await getDb()`
    SELECT
      g.id,
      g.name,
      g.slug,
      g.sso_enabled,
      g.account_domain_id,
      (SELECT identities_created_at IS NOT NULL FROM account_domains WHERE id = g.account_domain_id) AS boundary_locked,
      g.created_at,
      g.updated_at,
      (
        SELECT COUNT(*)::int
        FROM service_group_apps sga
        WHERE sga.group_id = g.id
      ) AS app_count
    FROM service_groups g
    ORDER BY g.name ASC
  `;
  return rows.map((row) => mapSummary(row as GroupRow));
}

export async function getServiceGroupForApi(
  groupId: string,
): Promise<{ ok: true; group: ServiceGroupDetail } | { ok: false; response: Response }> {
  const row = await findGroupRow(groupId);
  if (!row) {
    return { ok: false, response: problem(404, "Not Found", "Group not found") };
  }
  const apps = await loadGroupApps(groupId);
  return { ok: true, group: { ...mapSummary(row), apps } };
}

export async function createServiceGroup(
  body: CreateServiceGroupRequest,
): Promise<{ ok: true; group: ServiceGroupDetail } | { ok: false; response: Response }> {
  const nameResult = validateGroupName(body.name);
  if (!nameResult.ok) return nameResult;

  const slugInput = body.slug?.trim().toLowerCase();
  const baseSlug = slugInput || slugifyAppName(nameResult.name);
  if (!isValidSlug(baseSlug)) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid request", {
        errors: [{ field: "slug", code: ErrorCodes.INVALID_SLUG, message: "Slug format is invalid" }],
      }),
    };
  }

  const slug = await reserveUniqueSlug(baseSlug);
  if (!slug) {
    return {
      ok: false,
      response: problem(409, "Conflict", "Could not allocate a unique group slug", {
        code: ErrorCodes.SLUG_TAKEN,
      }),
    };
  }

  const appIdsResult = await validateAppIds(body.appIds ?? []);
  if (!appIdsResult.ok) return appIdsResult;

  let groupId: string;
  try {
    groupId = await getDb().begin(async (tx) => {
      const [inserted] = await tx`
        INSERT INTO service_groups (name, slug, sso_enabled)
        VALUES (${nameResult.name}, ${slug}, ${body.ssoEnabled ?? true}) RETURNING id
      `;
      const id = String(inserted.id);
      await assignAppsToGroup(tx, id, appIdsResult.ids);
      return id;
    });
  } catch (error) { return groupMutationError(error); }

  const detail = await getServiceGroupForApi(groupId);
  if (!detail.ok) return detail;
  return { ok: true, group: detail.group };
}

export async function patchServiceGroup(
  groupId: string,
  body: PatchServiceGroupRequest,
): Promise<{ ok: true; group: ServiceGroupDetail } | { ok: false; response: Response }> {
  const existing = await findGroupRow(groupId);
  if (!existing) {
    return { ok: false, response: problem(404, "Not Found", "Group not found") };
  }

  let name = existing.name;
  if (body.name !== undefined) {
    const nameResult = validateGroupName(body.name);
    if (!nameResult.ok) return nameResult;
    name = nameResult.name;
  }

  let slug = existing.slug;
  if (body.slug !== undefined) {
    const candidate = body.slug.trim().toLowerCase();
    if (!isValidSlug(candidate)) {
      return {
        ok: false,
        response: problem(400, "Validation Error", "Invalid request", {
          errors: [{ field: "slug", code: ErrorCodes.INVALID_SLUG, message: "Slug format is invalid" }],
        }),
      };
    }
    const [taken] = await getDb()`
      SELECT 1 FROM service_groups WHERE slug = ${candidate} AND id <> ${groupId} LIMIT 1
    `;
    if (taken) {
      return {
        ok: false,
        response: problem(409, "Conflict", "Slug is already in use", { code: ErrorCodes.SLUG_TAKEN }),
      };
    }
    slug = candidate;
  }

  const ssoEnabled = body.ssoEnabled ?? existing.sso_enabled;

  await getDb()`
    UPDATE service_groups
    SET name = ${name},
        slug = ${slug},
        sso_enabled = ${ssoEnabled},
        updated_at = NOW()
    WHERE id = ${groupId}
  `;

  const detail = await getServiceGroupForApi(groupId);
  if (!detail.ok) return detail;
  return { ok: true, group: detail.group };
}

export async function putServiceGroupApps(
  groupId: string,
  body: PutServiceGroupAppsRequest,
): Promise<{ ok: true; group: ServiceGroupDetail } | { ok: false; response: Response }> {
  const existing = await findGroupRow(groupId);
  if (!existing) {
    return { ok: false, response: problem(404, "Not Found", "Group not found") };
  }

  const appIdsResult = await validateAppIds(body.appIds);
  if (!appIdsResult.ok) return appIdsResult;

  const conflict = await assertAppsNotInOtherGroup(appIdsResult.ids, groupId);
  if (!conflict.ok) return conflict;

  try {
    await getDb().begin(async (tx) => {
      await tx`SELECT id FROM service_groups WHERE id = ${groupId} FOR UPDATE`;
      await assignAppsToGroup(tx, groupId, appIdsResult.ids);
      await tx`UPDATE service_groups SET updated_at = NOW() WHERE id = ${groupId}`;
    });
  } catch (error) { return groupMutationError(error); }

  const detail = await getServiceGroupForApi(groupId);
  if (!detail.ok) return detail;
  return { ok: true, group: detail.group };
}

export async function deleteServiceGroup(
  groupId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const existing = await findGroupRow(groupId);
  if (!existing) {
    return { ok: false, response: problem(404, "Not Found", "Group not found") };
  }

  try {
    await getDb()`DELETE FROM service_groups WHERE id = ${groupId}`;
  } catch (error) { return groupMutationError(error); }
  return { ok: true };
}
