import type { BunRequest } from "bun";

import type { RegenerateRecoveryKeyRequest, RegenerateRecoveryKeyResponse } from "@shared/contracts/auth";
import { ErrorCodes } from "@shared/contracts/errors";
import { validateRequiredString, parseJsonBody } from "@shared/contracts/validation";

import { requireSession } from "../lib/auth";
import { validateCsrf } from "../lib/csrf";
import { getDb } from "../lib/db";
import { json, problem } from "../lib/http";
import { verifyPassword } from "../lib/password";
import { generateRecoveryKey, hashRecoveryKey } from "../lib/recovery-key";

export async function handleRegenerateRecoveryKey(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<RegenerateRecoveryKeyRequest>(req);
  if (!parsed.ok) return parsed.response;

  const pwErrors = validateRequiredString(parsed.body.currentPassword, "currentPassword", "Current password");
  if (pwErrors.length > 0) {
    return problem(400, "Validation Error", "Invalid request", { errors: pwErrors });
  }

  const [user] = await getDb()`
    SELECT password_hash FROM users WHERE id = ${auth.userId}
  `;
  if (!user) {
    return problem(401, "Unauthorized", "Authentication required");
  }

  const valid = await verifyPassword(
    parsed.body.currentPassword,
    (user as { password_hash: string }).password_hash,
  );
  if (!valid) {
    return problem(401, "Unauthorized", "Invalid password", {
      errors: [{ field: "currentPassword", code: ErrorCodes.INVALID_CREDENTIALS, message: "Invalid password" }],
    });
  }

  const recoveryKey = generateRecoveryKey();
  const keyHash = await hashRecoveryKey(recoveryKey);

  await getDb()`UPDATE user_recovery_keys SET revoked_at = NOW() WHERE user_id = ${auth.userId} AND revoked_at IS NULL`;
  await getDb()`INSERT INTO user_recovery_keys (user_id, key_hash) VALUES (${auth.userId}, ${keyHash})`;

  const body: RegenerateRecoveryKeyResponse = { recoveryKey };
  console.info(JSON.stringify({ event: "recovery_key.regenerated", userId: auth.userId }));
  return json(body);
}
