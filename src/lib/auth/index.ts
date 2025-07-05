import { sign, verify, decode } from "hono/jwt";
import * as bcrypt from "bcryptjs";
/**
 * Hashes a password using bcryptjs.
 * @param password - The plain text password
 * @param saltRounds - Number of salt Rounds
 * @returns The hashed password
 */
export async function hashPassword(
  password: string,
  saltRounds?: number
): Promise<string> {
  return await bcrypt.hash(
    password,
    saltRounds || process.env.SALT_ROUNDS || 10
  );
}

/**
 * JWT payload for authentication and authorization.
 * @property sub - User ID (subject)
 * @property orgId - Organization ID (if applicable)
 * @property role - User role (SUPER_ADMIN, ORG_ADMIN, ORG_USER, APP_USER)
 * @property appIds - App IDs (for app users)
 * @property type - Token type (access or refresh)
 * @property iat - Issued at (unix timestamp)
 * @property exp - Expiry (unix timestamp)
 */
export type JwtPayload = {
  sub: string;
  orgId?: string;
  role: "SUPER_ADMIN" | "ORG_ADMIN" | "ORG_USER" | "APP_USER";
  appIds?: string[];
  type: "access" | "refresh";
  iat?: number;
  exp?: number;
};

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

/**
 * Issues a JWT using hono/jwt.
 * @param payload - The JWT payload (without iat/exp)
 * @param options - Optional expiresIn override
 * @returns The signed JWT string
 */
export async function issueToken(
  payload: Omit<JwtPayload, "iat" | "exp">,
  options?: { expiresIn?: string | number }
) {
  const now = Math.floor(Date.now() / 1000);
  let exp: number | undefined = undefined;
  if (options?.expiresIn || JWT_EXPIRES_IN) {
    const expiresIn = options?.expiresIn || JWT_EXPIRES_IN;
    if (typeof expiresIn === "string" && expiresIn.endsWith("h")) {
      exp = now + parseInt(expiresIn) * 60 * 60;
    } else if (typeof expiresIn === "string" && expiresIn.endsWith("m")) {
      exp = now + parseInt(expiresIn) * 60;
    } else if (typeof expiresIn === "number") {
      exp = now + expiresIn;
    } else {
      exp = now + 60 * 60; // default 1h
    }
  }
  const token = await sign({ ...payload, iat: now, exp }, JWT_SECRET);
  return token;
}

/**
 * Verifies a JWT using hono/jwt and returns the decoded payload if valid.
 * @param token - The JWT string to verify
 * @returns The decoded JwtPayload if valid, otherwise null
 */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const payload = await verify(token, JWT_SECRET);
    return payload as JwtPayload;
  } catch (e) {
    return null;
  }
}
