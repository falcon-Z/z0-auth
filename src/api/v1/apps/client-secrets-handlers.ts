import type { CreateClientSecretRequest, RevokeClientSecretRequest } from "@z0/contracts/apps";
import { parseJsonBody } from "@z0/contracts/validation";
import { listClientSecrets, createClientSecret, revokeClientSecret } from "../../lib/client-secrets";
import { requireScope } from "../../lib/platform-rbac";
import { requireRecentConsoleMfa } from "../../lib/mfa";
import { validateCsrf } from "../../lib/csrf";
import { json } from "../../lib/http";
import type { RoutedRequest } from "../../lib/path-router";
const privateHeaders = { "Cache-Control": "no-store", Pragma: "no-cache" };
export async function handleListClientSecrets(req: RoutedRequest) {
  const auth = await requireScope(req, "apps.clients:read");
  if (!auth.ok) return auth.response;
  const result = await listClientSecrets(req.pathParams?.appId ?? "", req.pathParams?.clientId ?? "");
  return result.ok ? json({ secrets: result.secrets }, { headers: privateHeaders }) : result.response;
}
async function mutate(req: RoutedRequest, revoke: boolean) {
  const csrf = validateCsrf(req);
  if (csrf) return csrf;
  const auth = await requireScope(req, revoke ? "apps.clients:revoke" : "apps.clients:rotate");
  if (!auth.ok) return auth.response;
  const stepUp = await requireRecentConsoleMfa(req, auth.userId);
  if (stepUp) return stepUp;
  const parsed = await parseJsonBody<CreateClientSecretRequest & RevokeClientSecretRequest>(req);
  if (!parsed.ok) return parsed.response;
  const appId = req.pathParams?.appId ?? "", id = req.pathParams?.clientId ?? "";
  const result = revoke
    ? await revokeClientSecret(appId, id, req.pathParams?.secretId ?? "", parsed.body, auth.userId)
    : await createClientSecret(appId, id, parsed.body, auth.userId);
  if (!result.ok) return result.response;
  return json("data" in result ? result.data : { secret: result.secret }, { status: revoke ? 200 : 201, headers: privateHeaders });
}
export function handleCreateClientSecret(req: RoutedRequest) { return mutate(req, false); }
export function handleRevokeClientSecret(req: RoutedRequest) { return mutate(req, true); }
