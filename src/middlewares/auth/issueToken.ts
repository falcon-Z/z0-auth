import { sign } from "hono/jwt";
/**
 * Issues a JWT token for a user with a payload based on their role.
 *
 * - SUPER_ADMIN: Only userId and role are included.
 * - ORG_ADMIN, ORG_USER: userId, role, and orgId (if provided) are included.
 * - APP_USER: userId, role, orgId (if provided), and appId (if provided) are included.
 *
 * @param {Object} options - Options for issuing the token.
 * @param {string} options.userId - The user's unique ID (required).
 * @param {UserRole} options.role - The user's role (required).
 * @param {string} [options.orgId] - The organization ID (optional, required for org/app roles).
 * @param {string} [options.appId] - The app ID (optional, required for app users).
 * @param {string} options.secret - The secret key to sign the JWT (required).
 * @param {number} [options.expiresIn=3600] - Token expiration in seconds (default: 3600).
 * @returns {Promise<string>} The signed JWT token as a string.
 */
export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  ORG_ADMIN = "ORG_ADMIN",
  ORG_USER = "ORG_USER",
  APP_USER = "APP_USER",
}

type IssueTokenOptions = {
  userId: string;
  role: UserRole;
  orgId?: string;
  appId?: string;
  secret: string;
  expiresIn?: number; // seconds
};

export async function issueToken({
  userId,
  role,
  orgId,
  appId,
  secret,
  expiresIn = 3600,
}: IssueTokenOptions): Promise<string> {
  const payload: Record<string, any> = {
    sub: userId,
    role,
  };
  if (
    role === UserRole.ORG_ADMIN ||
    role === UserRole.ORG_USER ||
    role === UserRole.APP_USER
  ) {
    if (orgId) payload.orgId = orgId;
  }
  if (role === UserRole.APP_USER && appId) {
    payload.appId = appId;
  }

  const now = Math.floor(Date.now() / 1000);
  payload.iat = now;
  payload.exp = now + expiresIn;
  return await sign(payload, secret);
}
