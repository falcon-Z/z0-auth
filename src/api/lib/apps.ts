import { lockResourceAuthority, contractResourceGrants } from "./oauth-resources";
import type { SQL } from "bun";
import type {
  AppDetail,
  AppSummary,
  Assurance,
  CreateAppRequest,
  CreateAppResponse,
  PatchAppRequest,
} from "@z0/contracts/apps";
import { validateRequiredString } from "@z0/contracts/validation";
import { getDb } from "./db";
import { problem } from "./http";
import { slugifyAppName, isValidSlug } from "./slug";
import { seedDefaultOidcScopesForApp } from "./default-app-scopes";
import { insertClient, validateClient } from "./oauth-clients";

export type AppRow = {
  id: string;
  name: string;
  slug: string;
  status: AppSummary["status"];
  minimum_assurance: Assurance;
  disabled_at: Date | null;
  deletion_started_at: Date | null;
  purge_after: Date | null;
  created_at: Date;
  updated_at: Date;
};
export function mapAppRow(row: AppRow, count: number): AppSummary {
  return {
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    status: row.status,
    minimumAssurance: row.minimum_assurance,
    activeClientCount: row.status === "active" ? count : 0,
    deletionStartedAt: row.deletion_started_at ? new Date(row.deletion_started_at).toISOString() : null,
    purgeAfter: row.purge_after ? new Date(row.purge_after).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    disabledAt: row.disabled_at
      ? new Date(row.disabled_at).toISOString()
      : null,
  };
}
export async function findAppRow(appId: string, database: SQL = getDb()): Promise<AppRow | null> {
  const [row] = await database`SELECT * FROM apps WHERE id = ${appId}`;
  return row ? (row as AppRow) : null;
}
export async function listAppsForApi(): Promise<AppSummary[]> {
  const rows =
    await getDb()`SELECT a.*, COUNT(c.id) FILTER (WHERE c.status = 'active')::int AS count
    FROM apps a LEFT JOIN oauth_clients c ON c.app_id = a.id GROUP BY a.id ORDER BY a.created_at`;
  return rows.map((r: AppRow & { count: number }) =>
    mapAppRow(r, Number(r.count)),
  );
}
export async function getAppForApi(
  appId: string,
): Promise<{ ok: true; app: AppDetail } | { ok: false; response: Response }> {
  const row = await findAppRow(appId);
  if (!row)
    return {
      ok: false,
      response: problem(404, "Not Found", "Application not found."),
    };
  const [count] =
    await getDb()`SELECT COUNT(*)::int AS count FROM oauth_clients WHERE app_id = ${appId} AND status = 'active'`;
  return { ok: true, app: mapAppRow(row, Number(count.count)) };
}
function invalid(detail: string) {
  return {
    ok: false as const,
    response: problem(400, "Validation Error", detail),
  };
}
function isAssurance(value: unknown): value is Assurance {
  return value === "baseline" || value === "strong";
}
export async function createApp(
  body: CreateAppRequest,
): Promise<
  { ok: true; data: CreateAppResponse } | { ok: false; response: Response }
> {
  const errors = validateRequiredString(body.name, "name", "Name");
  if (errors.length)
    return {
      ok: false,
      response: problem(
        400,
        "Validation Error",
        "Invalid application request.",
        { errors },
      ),
    };
  if ("clientType" in body || "redirectUris" in body)
    return invalid("Protocol configuration belongs to initialClient.");
  const minimum =
    body.minimumAssurance === undefined ? "baseline" : body.minimumAssurance;
  if (!isAssurance(minimum))
    return invalid("Minimum assurance must be baseline or strong.");
  const client = validateClient(body.initialClient, minimum);
  if (!client.ok) return client;
  const base = slugifyAppName(body.name);
  if (!isValidSlug(base))
    return invalid("Name cannot be turned into a valid slug.");
  for (let attempt = 0; attempt < 10; attempt++) {
    const slug =
      attempt === 0 ? base : `${base}-${crypto.randomUUID().slice(0, 8)}`;
    try {
      const data = await getDb().begin(async (tx) => {
        const [app] =
          await tx`INSERT INTO apps (name, slug, minimum_assurance) VALUES (${body.name.trim()}, ${slug}, ${minimum}) RETURNING *`;
        const created = await insertClient(
          tx,
          String(app.id),
          client.value,
          minimum,
        );
        await seedDefaultOidcScopesForApp(tx, String(app.id));
        return { app: mapAppRow(app as AppRow, 1), ...created };
      });
      return { ok: true, data };
    } catch (error) {
      if (
        attempt < 9 &&
        String((error as { errno?: string }).errno) === "23505"
      )
        continue;
      throw error;
    }
  }
  return invalid("Unable to reserve application slug.");
}
// Revoking renewable authority prevents re-enable from resurrecting it.
export async function containApplication(tx: SQL, appId: string) {
  await tx`UPDATE oauth_authorization_codes SET used_at = COALESCE(used_at, NOW()) WHERE app_id = ${appId}`;
  await tx`UPDATE oauth_consent_challenges SET consumed_at = COALESCE(consumed_at, NOW()), completion_outcome = COALESCE(completion_outcome, 'expired') WHERE app_id = ${appId}`;
  await tx`UPDATE oauth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()), retry_key_hash = NULL, retry_response_ciphertext = NULL, retry_expires_at = NULL WHERE app_id = ${appId}`;
}
export async function patchApp(
  appId: string,
  body: PatchAppRequest,
): Promise<{ ok: true; app: AppDetail } | { ok: false; response: Response }> {
  if (
    "clientType" in body ||
    "redirectUris" in body ||
    "browserOrigins" in body
  )
    return invalid("Protocol configuration belongs to a child client.");
  if (body.name !== undefined) {
    const errors = validateRequiredString(body.name, "name", "Name");
    if (errors.length)
      return {
        ok: false,
        response: problem(
          400,
          "Validation Error",
          "Invalid application request.",
          { errors },
        ),
      };
  }
  if (
    body.minimumAssurance !== undefined &&
    !isAssurance(body.minimumAssurance)
  )
    return invalid("Minimum assurance must be baseline or strong.");
  if (
    body.status !== undefined &&
    body.status !== "active" &&
    body.status !== "disabled"
  )
    return invalid("Status must be active or disabled.");
  return getDb().begin(async (tx) => {
    await lockResourceAuthority(tx, true);
    const [row] = await tx`SELECT * FROM apps WHERE id = ${appId} FOR UPDATE`;
    if (!row)
      return {
        ok: false,
        response: problem(404, "Not Found", "Application not found."),
      };
    if (row.status === "pending_deletion") return { ok: false, response: problem(409, "Conflict", "Restore the pending Application before editing it.") };
    const status = body.status ?? row.status;
    const [updated] =
      await tx`UPDATE apps SET name = ${body.name?.trim() ?? row.name}, status = ${status},
      minimum_assurance = ${body.minimumAssurance ?? row.minimum_assurance},
      disabled_at = ${status === "disabled" ? (row.disabled_at ?? new Date()) : null}, updated_at = NOW()
      WHERE id = ${appId} RETURNING *`;
    if (status === "disabled") {
      await containApplication(tx, appId);
      await tx`UPDATE oauth_grants SET revoked_at = COALESCE(revoked_at, NOW()) WHERE app_id = ${appId}`;
      await contractResourceGrants(tx);
    }
    const [count] =
      await tx`SELECT COUNT(*)::int AS count FROM oauth_clients WHERE app_id = ${appId} AND status = 'active'`;
    return { ok: true, app: mapAppRow(updated as AppRow, Number(count.count)) };
  });
}
export async function countApps(): Promise<number> {
  const [row] =
    await getDb()`SELECT COUNT(*)::int AS count FROM apps WHERE status = 'active'`;
  return Number(row.count);
}
