import { seedDefaultOidcScopesForApp } from "../../src/api/lib/default-app-scopes";
import { getDb } from "../../src/api/lib/db";
import {
  createResource,
  patchResource,
  putClientResource,
} from "../../src/api/lib/oauth-resources";

/** Explicitly configure a registered audience and scope ceiling for protocol fixtures. */
export async function testResourceForClient(clientId: string, requestedAudience?: string): Promise<string> {
  const db = getDb();
  const [client] =
    await db`SELECT id, app_id FROM oauth_clients WHERE client_id = ${clientId} OR id::text = ${clientId}`;
  if (!client) throw new Error("Unknown fixture client");
  await db.begin((tx) => seedDefaultOidcScopesForApp(tx, client.app_id));
  const audience = requestedAudience ?? `urn:z0:test:${client.id}`;
  const [existing] =
    await db`SELECT id FROM oauth_resources WHERE audience = ${audience}`;
  const rows =
    await db`SELECT name FROM app_scopes WHERE app_id = ${client.app_id}`;
  const scopes = rows.map((r: { name: string }) => r.name);
  const result = existing
    ? await patchResource(client.app_id, existing.id, { scopes })
    : await createResource(client.app_id, {
        name: "Fixture API",
        audience,
        scopes,
      });
  if (!result.ok) throw new Error(await result.response.text());
  const permission = await putClientResource(
    client.app_id,
    client.id,
    result.resource.id,
    scopes,
  );
  if (!permission.ok) throw new Error(await permission.response.text());
  return audience;
}
