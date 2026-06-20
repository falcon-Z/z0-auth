import type { PutAppFederationSettingsRequest } from "@z0/contracts/federation";
import { parseJsonBody } from "@z0/contracts/validation";

import { validateCsrf } from "../../lib/csrf";
import { json, problem } from "../../lib/http";
import { requireScope } from "../../lib/platform-rbac";
import type { RoutedRequest } from "../../lib/path-router";
import { writeAuditEvent } from "../../lib/audit";
import { getAppFederationSettingsForApi, putAppFederationSettings } from "../../lib/federation-providers";

export async function handleGetAppFederationSettings(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "apps.federation:read");
  if (!auth.ok) return auth.response;

  const settings = await getAppFederationSettingsForApi(req, req.pathParams?.appId ?? "");
  if (!settings) {
    return problem(404, "Not Found", "Application not found");
  }
  return json(settings);
}

export async function handlePutAppFederationSettings(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireScope(req, "apps.federation:manage");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<PutAppFederationSettingsRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await putAppFederationSettings(req, req.pathParams?.appId ?? "", parsed.body);
  if (!result.ok) return result.response;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "federation.app_updated",
    resourceType: "app",
    resourceId: req.pathParams?.appId ?? "",
  });

  return json(result.settings);
}
