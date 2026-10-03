import { ErrorCodes } from "@z0/contracts/errors";
import type { SQL } from "bun";
import type {
  ResourceSummary,
  CreateResourceRequest,
  PatchResourceRequest,
  ClientResourcePermission,
} from "@z0/contracts/resources";
import { getDb } from "./db";
import { problem } from "./http";

// Serialize changes to the ceiling with issuance, across application owners.
export async function lockResourceAuthority(tx: SQL, write = false) {
  if (write)
    await tx`SELECT pg_advisory_xact_lock(hashtext('z0:resource-authority'))`;
  else
    await tx`SELECT pg_advisory_xact_lock_shared(hashtext('z0:resource-authority'))`;
}
function fail(status: number, detail: string) {
  return {
    ok: false as const,
    response: problem(
      status,
      status === 404
        ? "Not Found"
        : status === 409
          ? "Conflict"
          : "Validation Error",
      detail,
      {
        code:
          status === 404
            ? ErrorCodes.RESOURCE_NOT_FOUND
            : status === 409
              ? ErrorCodes.RESOURCE_STATE_CONFLICT
              : ErrorCodes.RESOURCE_CONFIGURATION_INVALID,
      },
    ),
  };
}
export function validResourceIndicator(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 2048 ||
    /[^\x21-\x7E]|["<>\\^`{|}#]|%(?![0-9A-Fa-f]{2})/.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    return Boolean(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}
const validId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function validScopes(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(
      (s) => typeof s === "string" && /^[\x21\x23-\x5B\x5D-\x7E]+$/.test(s),
    ) &&
    new Set(value).size === value.length
  );
}
function validName(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= 128
  );
}
const resourceQuery = (tx: SQL, appId: string) => tx`
  SELECT r.*, COALESCE(array_agg(s.name ORDER BY s.name) FILTER (WHERE s.id IS NOT NULL), ARRAY[]::text[]) AS scopes
  FROM oauth_resources r LEFT JOIN oauth_resource_scopes rs ON rs.resource_id = r.id LEFT JOIN app_scopes s ON s.id = rs.scope_id
  WHERE r.app_id = ${appId} GROUP BY r.id ORDER BY r.created_at`;
type ResourceRow = {
  id: string;
  app_id: string;
  audience: string;
  name: string;
  status: ResourceSummary["status"];
  scopes: string[];
};
function mapResource(r: ResourceRow): ResourceSummary {
  return {
    id: r.id,
    appId: r.app_id,
    audience: r.audience,
    name: r.name,
    status: r.status,
    scopes: r.scopes,
  };
}
export async function listResources(appId: string) {
  if (!validId(appId)) return fail(404, "Configuration not found.");
  const [app] = await getDb()`SELECT id FROM apps WHERE id = ${appId}`;
  return app
    ? {
        ok: true as const,
        resources: (await resourceQuery(getDb(), appId)).map(mapResource),
      }
    : fail(404, "Application not found.");
}
export async function listAvailableResources(): Promise<ResourceSummary[]> {
  const rows =
    await getDb()`SELECT r.*, COALESCE(array_agg(s.name ORDER BY s.name) FILTER (WHERE s.id IS NOT NULL), ARRAY[]::text[]) AS scopes
    FROM oauth_resources r JOIN apps a ON a.id = r.app_id LEFT JOIN oauth_resource_scopes rs ON rs.resource_id = r.id LEFT JOIN app_scopes s ON s.id = rs.scope_id
    WHERE r.status = 'active' AND a.status = 'active' GROUP BY r.id ORDER BY r.name`;
  return rows.map(mapResource);
}
async function setResourceScopes(
  tx: SQL,
  resourceId: string,
  appId: string,
  scopes: string[],
) {
  const rows = scopes.length
    ? await tx`SELECT id FROM app_scopes WHERE app_id = ${appId} AND name IN ${tx(scopes)}`
    : [];
  if (rows.length !== scopes.length) return false;
  // Preserve unchanged relationships; deleting and re-inserting them would erase permissions.
  const ids = rows.map((r: { id: string }) => r.id);
  if (ids.length)
    await tx`DELETE FROM oauth_resource_scopes WHERE resource_id = ${resourceId} AND scope_id NOT IN ${tx(ids)}`;
  else
    await tx`DELETE FROM oauth_resource_scopes WHERE resource_id = ${resourceId}`;
  for (const row of rows)
    await tx`INSERT INTO oauth_resource_scopes(resource_id, app_id, scope_id) VALUES (${resourceId}, ${appId}, ${row.id}) ON CONFLICT DO NOTHING`;
  return true;
}
// Persist contractions at configuration time, so remove/re-add before refresh cannot restore authority.
export async function contractResourceGrants(tx: SQL) {
  await tx`UPDATE oauth_grants g SET
    scope = COALESCE((SELECT string_agg(requested.name, ' ' ORDER BY requested.ordinality)
      FROM unnest(string_to_array(g.scope, ' ')) WITH ORDINALITY requested(name, ordinality)
      WHERE EXISTS (SELECT 1 FROM client_resource_scopes cs JOIN app_scopes s ON s.id = cs.scope_id
        WHERE cs.client_id = g.client_id AND cs.resource_id = g.resource_id AND s.name = requested.name)), ''),
    revoked_at = CASE WHEN EXISTS (SELECT 1 FROM client_resource_permissions p JOIN oauth_resources r ON r.id = p.resource_id
      JOIN apps a ON a.id = r.app_id WHERE p.client_id = g.client_id AND p.resource_id = g.resource_id AND r.status = 'active' AND a.status = 'active') THEN NULL ELSE NOW() END
    WHERE g.revoked_at IS NULL`;
  // Never replay an encrypted response issued under a wider ceiling.
  await tx`UPDATE oauth_refresh_tokens t SET retry_key_hash = NULL, retry_response_ciphertext = NULL, retry_expires_at = NULL,
    revoked_at = CASE WHEN g.revoked_at IS NOT NULL THEN COALESCE(t.revoked_at, NOW()) ELSE t.revoked_at END
    FROM oauth_grants g WHERE g.id = t.grant_id AND (g.scope <> t.scope OR g.revoked_at IS NOT NULL)`;
}
export async function createResource(
  appId: string,
  body: CreateResourceRequest,
) {
  if (!validId(appId)) return fail(404, "Configuration not found.");
  if (
    Object.keys(body).some(
      (k) => !["name", "audience", "scopes"].includes(k),
    ) ||
    !validName(body.name) ||
    !validResourceIndicator(body.audience) ||
    !validScopes(body.scopes)
  )
    return fail(
      400,
      "Provide a name, absolute audience URI without a fragment, and unique scope names.",
    );
  try {
    return await getDb().begin(async (tx) => {
      await lockResourceAuthority(tx, true);
      const [app] =
        await tx`SELECT id FROM apps WHERE id = ${appId} FOR UPDATE`;
      if (!app) return fail(404, "Application not found.");
      const scopes = body.scopes.length
        ? await tx`SELECT id FROM app_scopes WHERE app_id = ${appId} AND name IN ${tx(body.scopes)}`
        : [];
      if (scopes.length !== body.scopes.length)
        return fail(
          400,
          "Resource scopes must belong to the owning application's vocabulary.",
        );
      const [r] =
        await tx`INSERT INTO oauth_resources(app_id, audience, name) VALUES (${appId}, ${body.audience}, ${body.name.trim()}) RETURNING id`;
      await setResourceScopes(tx, r.id, appId, body.scopes);
      return {
        ok: true as const,
        resource: (await resourceQuery(tx, appId))
          .map(mapResource)
          .find((item: ResourceSummary) => item.id === r.id)!,
      };
    });
  } catch (e) {
    if ((e as { errno?: string }).errno === "23505")
      return fail(
        409,
        "This audience is already reserved, including retired resources.",
      );
    throw e;
  }
}
export async function patchResource(
  appId: string,
  id: string,
  body: PatchResourceRequest,
  retire = false,
) {
  if (!validId(appId) || !validId(id))
    return fail(404, "Configuration not found.");
  if (
    Object.keys(body).some((k) => !["name", "scopes"].includes(k)) ||
    (body.name !== undefined && !validName(body.name)) ||
    (body.scopes !== undefined && !validScopes(body.scopes))
  )
    return fail(
      400,
      "Resource identity is immutable; provide a valid name or unique scopes.",
    );
  return getDb().begin(async (tx) => {
    await lockResourceAuthority(tx, true);
    await tx`SELECT id FROM apps WHERE id = ${appId} FOR UPDATE`;
    const [r] =
      await tx`SELECT * FROM oauth_resources WHERE id = ${id} AND app_id = ${appId} FOR UPDATE`;
    if (!r) return fail(404, "Resource not found.");
    if (r.status === "retired")
      return fail(409, "Resource is permanently retired.");
    if (
      body.scopes !== undefined &&
      !(await setResourceScopes(tx, id, appId, body.scopes))
    )
      return fail(400, "Unknown scope in the resource's application.");
    await tx`UPDATE oauth_resources SET name = ${body.name?.trim() ?? r.name}, status = ${retire ? "retired" : "active"}, updated_at = NOW() WHERE id = ${id}`;
    await contractResourceGrants(tx);
    return {
      ok: true as const,
      resource: (await resourceQuery(tx, appId))
        .map(mapResource)
        .find((r: ResourceSummary) => r.id === id)!,
    };
  });
}
export async function listClientResources(appId: string, clientId: string) {
  if (!validId(appId) || !validId(clientId))
    return fail(404, "Configuration not found.");
  const [client] =
    await getDb()`SELECT id FROM oauth_clients WHERE id = ${clientId} AND app_id = ${appId}`;
  if (!client) return fail(404, "Client not found.");
  const rows = await getDb()`SELECT r.id AS "resourceId", r.audience, r.name,
    COALESCE(array_agg(s.name ORDER BY s.name) FILTER (WHERE s.id IS NOT NULL), ARRAY[]::text[]) AS scopes
    FROM client_resource_permissions p JOIN oauth_resources r ON r.id = p.resource_id
    LEFT JOIN client_resource_scopes cs ON cs.client_id = p.client_id AND cs.resource_id = p.resource_id LEFT JOIN app_scopes s ON s.id = cs.scope_id
    WHERE p.client_id = ${clientId} GROUP BY r.id ORDER BY r.name`;
  return { ok: true as const, permissions: rows as ClientResourcePermission[] };
}
export async function putClientResource(
  appId: string,
  clientId: string,
  resourceId: string,
  scopes: unknown,
  remove = false,
) {
  if (!validId(appId) || !validId(clientId) || !validId(resourceId))
    return fail(404, "Configuration not found.");
  if (!remove && !validScopes(scopes))
    return fail(400, "Provide unique permitted scope names.");
  return getDb().begin(async (tx) => {
    await lockResourceAuthority(tx, true);
    await tx`SELECT id FROM apps WHERE id = ${appId} FOR UPDATE`;
    const [client] =
      await tx`SELECT id FROM oauth_clients WHERE id = ${clientId} AND app_id = ${appId} FOR UPDATE`;
    if (!client) return fail(404, "Client not found.");
    const [resource] =
      await tx`SELECT r.id FROM oauth_resources r JOIN apps a ON a.id = r.app_id WHERE r.id = ${resourceId} AND r.status = 'active' AND a.status = 'active'`;
    if (!resource && !remove) return fail(404, "Active resource not found.");
    if (remove)
      await tx`DELETE FROM client_resource_permissions WHERE client_id = ${clientId} AND resource_id = ${resourceId}`;
    else {
      const names = scopes as string[];
      const rows = names.length
        ? await tx`SELECT s.id FROM oauth_resource_scopes rs JOIN app_scopes s ON s.id = rs.scope_id WHERE rs.resource_id = ${resourceId} AND s.name IN ${tx(names)}`
        : [];
      if (rows.length !== names.length)
        return fail(
          400,
          "Permitted scopes must be exposed by the selected resource.",
        );
      await tx`INSERT INTO client_resource_permissions(client_id, resource_id) VALUES (${clientId}, ${resourceId}) ON CONFLICT DO NOTHING`;
      await tx`DELETE FROM client_resource_scopes WHERE client_id = ${clientId} AND resource_id = ${resourceId}`;
      for (const row of rows)
        await tx`INSERT INTO client_resource_scopes(client_id, resource_id, scope_id) VALUES (${clientId}, ${resourceId}, ${row.id})`;
    }
    await contractResourceGrants(tx);
    return { ok: true as const };
  });
}
export async function resolveResourceAuthority(
  tx: SQL,
  clientId: string,
  resource: string | undefined,
  scope: string,
) {
  if (!validResourceIndicator(resource))
    return { ok: false as const, error: "invalid_target" as const };
  const [r] =
    await tx`SELECT r.id, r.audience FROM oauth_resources r JOIN apps a ON a.id = r.app_id
    JOIN client_resource_permissions p ON p.resource_id = r.id
    WHERE r.audience = ${resource} AND r.status = 'active' AND a.status = 'active' AND p.client_id = ${clientId}`;
  if (!r) return { ok: false as const, error: "invalid_target" as const };
  const requested = [...new Set(scope.trim().split(/\s+/).filter(Boolean))];
  const rows =
    await tx`SELECT s.name FROM client_resource_scopes cs JOIN app_scopes s ON s.id = cs.scope_id WHERE cs.client_id = ${clientId} AND cs.resource_id = ${r.id}`;
  const allowed = new Set(rows.map((s: { name: string }) => s.name));
  if (requested.some((s) => !allowed.has(s)))
    return { ok: false as const, error: "invalid_scope" as const };
  return {
    ok: true as const,
    resourceId: String(r.id),
    audience: String(r.audience),
    scope: requested.join(" "),
  };
}
