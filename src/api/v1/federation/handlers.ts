import type { BunRequest } from "bun";

import type {
  CreateCustomIdentityProviderRequest,
  CreateIdentityProviderFromTemplateRequest,
  PatchIdentityProviderRequest,
} from "@z0/contracts/federation";
import { parseJsonBody } from "@z0/contracts/validation";

import { validateCsrf } from "../../lib/csrf";
import { json, problem } from "../../lib/http";
import { requireScope } from "../../lib/platform-rbac";
import type { RoutedRequest } from "../../lib/path-router";
import { writeAuditEvent } from "../../lib/audit";
import {
  createCustomProvider,
  createProviderFromTemplate,
  deleteIdentityProvider,
  getIdentityProviderForApi,
  listAvailableBuiltinTemplates,
  listIdentityProvidersForApi,
  patchIdentityProvider,
} from "../../lib/federation-providers";
import { listBuiltinSetupGuides } from "../../lib/federation-builtin";
import { requireRecentConsoleMfa } from "../../lib/mfa";

export async function handleListIdentityProviders(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "settings.federation:read");
  if (!auth.ok) return auth.response;
  const providers = await listIdentityProvidersForApi(req);
  return json({ providers });
}

export async function handleListBuiltinTemplates(_req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(_req, "settings.federation:read");
  if (!auth.ok) return auth.response;
  return json({
    templates: listAvailableBuiltinTemplates(),
    guides: listBuiltinSetupGuides(),
  });
}

export async function handleGetIdentityProvider(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "settings.federation:read");
  if (!auth.ok) return auth.response;
  const providerId = req.pathParams?.providerId ?? "";
  const provider = await getIdentityProviderForApi(req, providerId);
  if (!provider) {
    return problem(404, "Not Found", "Provider not found");
  }
  return json(provider);
}

export async function handleCreateProviderFromTemplate(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireScope(req, "settings.federation:update");
  if (!auth.ok) return auth.response;
  const stepUpError = await requireRecentConsoleMfa(req, auth.userId);
  if (stepUpError) return stepUpError;

  const parsed = await parseJsonBody<CreateIdentityProviderFromTemplateRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await createProviderFromTemplate(req, parsed.body);
  if (!result.ok) return result.response;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "federation.provider_created",
    resourceType: "identity_provider",
    resourceId: result.provider.id,
    payload: { key: result.provider.key, type: "builtin" },
  });

  return json(result.provider, { status: 201 });
}

export async function handleCreateCustomProvider(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireScope(req, "settings.federation:update");
  if (!auth.ok) return auth.response;
  const stepUpError = await requireRecentConsoleMfa(req, auth.userId);
  if (stepUpError) return stepUpError;

  const parsed = await parseJsonBody<CreateCustomIdentityProviderRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await createCustomProvider(req, parsed.body);
  if (!result.ok) return result.response;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "federation.provider_created",
    resourceType: "identity_provider",
    resourceId: result.provider.id,
    payload: { key: result.provider.key, type: "custom" },
  });

  return json(result.provider, { status: 201 });
}

export async function handlePatchIdentityProvider(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireScope(req, "settings.federation:update");
  if (!auth.ok) return auth.response;
  const stepUpError = await requireRecentConsoleMfa(req, auth.userId);
  if (stepUpError) return stepUpError;

  const parsed = await parseJsonBody<PatchIdentityProviderRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await patchIdentityProvider(req, req.pathParams?.providerId ?? "", parsed.body);
  if (!result.ok) return result.response;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "federation.provider_updated",
    resourceType: "identity_provider",
    resourceId: result.provider.id,
  });

  return json(result.provider);
}

export async function handleDeleteIdentityProvider(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireScope(req, "settings.federation:update");
  if (!auth.ok) return auth.response;
  const stepUpError = await requireRecentConsoleMfa(req, auth.userId);
  if (stepUpError) return stepUpError;

  const error = await deleteIdentityProvider(req.pathParams?.providerId ?? "");
  if (error) return error;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "federation.provider_deleted",
    resourceType: "identity_provider",
    resourceId: req.pathParams?.providerId ?? "",
  });

  return new Response(null, { status: 204 });
}
