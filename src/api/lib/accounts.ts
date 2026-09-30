import { normalizeEmail } from "@z0/contracts/validation";

import { getDb } from "./db";

export type ApplicationAccount = {
  accountId: string;
  accountDomainId: string;
  appUserId: string | null;
  email: string;
  passwordHash: string | null;
  status: string;
  disabledAt: Date | null;
  lockedUntil: Date | null;
  deletedAt: Date | null;
};

/** Resolve identity authority first. A matching account need not have an app binding. */
export async function findAccountForApplication(
  appId: string,
  email: string,
): Promise<ApplicationAccount | null> {
  const [row] = await getDb()`
    SELECT c.id, c.account_domain_id, b.id AS app_user_id, c.email,
           c.password_hash, c.status, c.disabled_at, c.locked_until, c.deleted_at
    FROM apps a
    JOIN accounts c ON c.account_domain_id = a.account_domain_id
    LEFT JOIN app_account_bindings b ON b.app_id = a.id AND b.account_id = c.id
    WHERE a.id = ${appId} AND lower(c.email) = ${normalizeEmail(email)}
  `;
  if (!row) return null;
  return {
    accountId: String(row.id),
    accountDomainId: String(row.account_domain_id),
    appUserId: row.app_user_id ? String(row.app_user_id) : null,
    email: String(row.email),
    passwordHash: row.password_hash as string | null,
    status: String(row.status),
    disabledAt: row.disabled_at ? new Date(row.disabled_at) : null,
    lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}
