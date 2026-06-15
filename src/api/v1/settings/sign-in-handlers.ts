import type { PutAppSignInSettingsRequest, PutInstanceSignInSettingsRequest } from "@z0/contracts/auth-settings";
import { parseJsonBody } from "@z0/contracts/validation";

import {
  getAppSignInSettingsForApi,
  getInstanceSignInSettingsForApi,
  putAppSignInSettings,
  putInstanceSignInSettings,
} from "../../lib/auth-settings";
import { validateCsrf } from "../../lib/csrf";
import { json, problem } from "../../lib/http";
import { getAppForApi } from "../../lib/apps";
import { requireScope } from "../../lib/platform-rbac";
import type { RoutedRequest } from "../../lib/path-router";
import { writeAuditEvent } from "../../lib/audit";
import { ErrorCodes } from "@z0/contracts/errors";

export async function handleGetInstanceSignInSettings(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "settings.sign-in:read");
  if (!auth.ok) return auth.response;
  const settings = await getInstanceSignInSettingsForApi();
  return json(settings);
}

export async function handlePutInstanceSignInSettings(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireScope(req, "settings.sign-in:update");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<PutInstanceSignInSettingsRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await putInstanceSignInSettings(parsed.body);
  if (!result.ok) return result.response;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "auth_settings.instance_updated",
    resourceType: "instance_auth_settings",
    resourceId: "1",
    payload: { signInMethods: result.settings.signInMethods },
  });

  return json(result.settings);
}

export async function handleGetAppSignInSettings(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const auth = await requireScope(req, "apps:read");
  if (!auth.ok) return auth.response;

  const app = await getAppForApi(appId);
  if (!app.ok) return app.response;

  const settings = await getAppSignInSettingsForApi(appId);
  if (!settings) {
    return problem(404, "Not Found", "Application not found.", {
      errors: [{ field: "appId", code: ErrorCodes.APP_NOT_FOUND, message: "Application not found" }],
    });
  }
  return json(settings);
}

export async function handlePutAppSignInSettings(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireScope(req, "apps:update");
  if (!auth.ok) return auth.response;

  const app = await getAppForApi(appId);
  if (!app.ok) return app.response;

  const parsed = await parseJsonBody<PutAppSignInSettingsRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await putAppSignInSettings(appId, parsed.body);
  if (!result.ok) return result.response;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "auth_settings.app_updated",
    resourceType: "app_auth_settings",
    resourceId: appId,
    payload: { signInMethods: result.settings.signInMethods },
  });

  return json(result.settings);
}
