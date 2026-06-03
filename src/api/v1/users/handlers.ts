import type { PatchPlatformUserRequest } from "@z0/contracts/users";
import { ErrorCodes } from "@z0/contracts/errors";
import { parseJsonBody } from "@z0/contracts/validation";

import { json, problem } from "../../lib/http";
import { validateCsrf } from "../../lib/csrf";
import { requireInstanceMember } from "../../lib/instance-members";
import type { RoutedRequest } from "../../lib/path-router";
import {
  getPlatformUserDetail,
  listPlatformUsers,
  updatePlatformUserStatus,
} from "../../lib/users";

function userIdFrom(req: RoutedRequest): string {
  return req.pathParams?.userId ?? "";
}

export async function handleListUsers(req: RoutedRequest): Promise<Response> {
  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const users = await listPlatformUsers();
  return json({ users });
}

export async function handleGetUser(req: RoutedRequest): Promise<Response> {
  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const user = await getPlatformUserDetail(userIdFrom(req));
  if (!user) {
    return problem(404, "Not Found", "User not found", {
      errors: [
        {
          field: "userId",
          code: ErrorCodes.USER_NOT_FOUND,
          message: "User not found",
        },
      ],
    });
  }
  return json(user);
}

export async function handlePatchUser(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<PatchPlatformUserRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await updatePlatformUserStatus(auth.userId, userIdFrom(req), parsed.body);
  if (!result.ok) return result.response;
  return json(result.user);
}
