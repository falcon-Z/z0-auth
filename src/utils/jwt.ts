import { generateAccessToken, generateRefreshToken, TokenPayload } from "./auth";

/**
 * Generic token signing function
 * This is a wrapper around generateAccessToken and generateRefreshToken
 * @param payload - Token payload
 * @param expiresIn - Expiration time (e.g., "15m", "7d")
 * @returns Promise<string> - Signed JWT token
 */
export async function signToken(
  payload: Partial<TokenPayload> & { userId: string; email: string },
  expiresIn: string
): Promise<string> {
  // Normalize the payload to match TokenPayload interface
  const tokenPayload: Omit<TokenPayload, "iat" | "exp"> = {
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    roleType: payload.roleType,
    scopes: payload.scopes,
    orgId: payload.orgId,
    type: payload.type || "user",
  };

  // For short-lived tokens (like access tokens), use generateAccessToken
  // For long-lived tokens (like refresh tokens), use generateRefreshToken
  // This is a simple heuristic based on common patterns
  const isLongLived = expiresIn.includes("d") || expiresIn.includes("h") && parseInt(expiresIn) > 1;

  if (isLongLived && expiresIn !== "1h") {
    return await generateRefreshToken(tokenPayload);
  } else {
    return await generateAccessToken(tokenPayload);
  }
}
