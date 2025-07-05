import { verify } from "hono/jwt";
import { PrismaClient, User, Organization, App } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Verifies a JWT token and returns user, org, and app info if present.
 *
 * @param {string} token - The JWT token to verify.
 * @returns {Promise<{ user: User | null, org: Organization | null, app: App | null, payload: any }>} - The user, org, app, and payload.
 * @throws {Error} If the token is invalid or required info is missing.
 */
export async function verifyToken(token: string): Promise<{
  user: User | null;
  org: Organization | null;
  app: App | null;
  payload: any;
}> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  const payload = await verify(token, secret);
  if (!payload || typeof payload !== "object")
    throw new Error("Invalid token payload");

  let user: User | null = null;
  let org: Organization | null = null;
  let app: App | null = null;

  if (payload.sub) {
    user = await prisma.user.findUnique({ where: { id: payload.sub } });
  }
  if (payload.orgId) {
    org = await prisma.organization.findUnique({
      where: { id: payload.orgId },
    });
  }
  if (payload.appId) {
    app = await prisma.app.findUnique({ where: { id: payload.appId } });
  }

  return { user, org, app, payload };
}
