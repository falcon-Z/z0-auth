import type { Context } from "hono";
import { existsSync } from "fs";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { PlatformRoleType, OrgRoleType, AppRoleType } from '@prisma/client';

/**
 * Lazy load Hono's JWT utilities to avoid import issues
 */
let jwtUtils: any = null;
async function getJWTUtils() {
  if (!jwtUtils) {
    const path = join(
      process.cwd(),
      "node_modules/hono/dist/middleware/jwt/index.js"
    );
    jwtUtils = await import(path);
  }
  return jwtUtils;
}

/**
 * Authentication utilities for password hashing and JWT token management
 * Uses Bun's built-in password hashing (Argon2id) and Web Crypto API for RSA keypairs
 */

/**
 * JWT Configuration from environment variables
 */
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

const KEYS_DIR = join(process.cwd(), "keys");
const PRIVATE_KEY_PATH = join(KEYS_DIR, "jwt-private.key");
const PUBLIC_KEY_PATH = join(KEYS_DIR, "jwt-public.key");

/**
 * Convert time string to seconds
 * @param timeStr - Time string like '15m', '7d', '1h'
 * @returns number - Time in seconds
 */
export function parseTimeToSeconds(timeStr: string): number {
  const unit = timeStr.slice(-1);
  const value = parseInt(timeStr.slice(0, -1));

  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 60 * 60;
    case "d":
      return value * 60 * 60 * 24;
    default:
      return value; // assume seconds if no unit
  }
}

/**
 * Generate RSA keypair for JWT signing
 * @returns Promise<CryptoKeyPair> - Generated RSA keypair
 */
async function generateRSAKeypair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true, // extractable
    ["sign", "verify"]
  );
}

/**
 * Export a crypto key to PEM format
 * @param key - CryptoKey to export
 * @param type - Key type ('private' or 'public')
 * @returns Promise<string> - PEM formatted key
 */
async function exportKeyToPEM(
  key: CryptoKey,
  type: "private" | "public"
): Promise<string> {
  const format = type === "private" ? "pkcs8" : "spki";
  const exported = await crypto.subtle.exportKey(format, key);
  const exportedAsString = String.fromCharCode.apply(
    null,
    Array.from(new Uint8Array(exported))
  );
  const exportedAsBase64 = btoa(exportedAsString);
  const pemExported = `-----BEGIN ${type.toUpperCase()} KEY-----\n${exportedAsBase64
    .match(/.{1,64}/g)
    ?.join("\n")}\n-----END ${type.toUpperCase()} KEY-----`;
  return pemExported;
}

/**
 * Import a PEM key to CryptoKey
 * @param pem - PEM formatted key string
 * @param type - Key type ('private' or 'public')
 * @returns Promise<CryptoKey> - Imported CryptoKey
 */
async function importKeyFromPEM(
  pem: string,
  type: "private" | "public"
): Promise<CryptoKey> {
  const pemHeader = `-----BEGIN ${type.toUpperCase()} KEY-----`;
  const pemFooter = `-----END ${type.toUpperCase()} KEY-----`;
  const pemContents = pem.substring(
    pemHeader.length,
    pem.length - pemFooter.length
  );
  const binaryDerString = atob(pemContents.replace(/\s/g, ""));
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  const format = type === "private" ? "pkcs8" : "spki";
  const keyUsages: KeyUsage[] = type === "private" ? ["sign"] : ["verify"];

  return await crypto.subtle.importKey(
    format,
    binaryDer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    true,
    keyUsages
  );
}

/**
 * Ensure JWT keypair exists, generate if not found
 * @returns Promise<void>
 */
export async function ensureJWTKeypair(): Promise<void> {
  try {
    if (!existsSync(KEYS_DIR)) {
      await mkdir(KEYS_DIR, { recursive: true });
    }

    if (existsSync(PRIVATE_KEY_PATH) && existsSync(PUBLIC_KEY_PATH)) {
      console.log("JWT keypair already exists");
      return;
    }

    console.log("Generating new JWT RSA keypair...");

    const keypair = await generateRSAKeypair();

    const privateKeyPEM = await exportKeyToPEM(keypair.privateKey, "private");
    const publicKeyPEM = await exportKeyToPEM(keypair.publicKey, "public");

    await writeFile(PRIVATE_KEY_PATH, privateKeyPEM, "utf8");
    await writeFile(PUBLIC_KEY_PATH, publicKeyPEM, "utf8");

    console.log("JWT keypair generated and saved successfully");
  } catch (error) {
    console.error("Failed to ensure JWT keypair:", error);
    throw new Error("Failed to initialize JWT keypair");
  }
}

/**
 * Load private key for JWT signing
 * @returns Promise<CryptoKey> - Private key for signing
 */
async function loadPrivateKey(): Promise<CryptoKey> {
  try {
    const privateKeyPEM = await readFile(PRIVATE_KEY_PATH, "utf8");
    return await importKeyFromPEM(privateKeyPEM, "private");
  } catch (error) {
    throw new Error("Failed to load private key. Ensure keypair is generated.");
  }
}

/**
 * Load public key for JWT verification
 * @returns Promise<CryptoKey> - Public key for verification
 */
async function loadPublicKey(): Promise<CryptoKey> {
  try {
    const publicKeyPEM = await readFile(PUBLIC_KEY_PATH, "utf8");
    return await importKeyFromPEM(publicKeyPEM, "public");
  } catch (error) {
    throw new Error("Failed to load public key. Ensure keypair is generated.");
  }
}

/**
 * Hash a password using Bun's built-in Argon2id algorithm
 * @param password - Plain text password to hash
 * @returns Promise<string> - Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    const hashedPassword = await Bun.password.hash(password, {
      algorithm: "argon2id",
      memoryCost: 65536, // 64 MB
      timeCost: 2,
    });
    return hashedPassword;
  } catch (error) {
    throw new Error("Failed to hash password");
  }
}

/**
 * Verify a password against its hash using Bun's built-in verification
 * @param password - Plain text password to verify
 * @param hash - Hashed password to compare against
 * @returns Promise<boolean> - True if password matches, false otherwise
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    const isValid = await Bun.password.verify(password, hash);
    return isValid;
  } catch (error) {
    throw new Error("Failed to verify password");
  }
}

/**
 * Organization context in token
 */
export interface OrgContext {
  orgId: string;
  orgSlug: string;
  roleType: OrgRoleType;
}

/**
 * App context in token
 */
export interface AppContext {
  appId: string;
  appSlug?: string;
  roleType: AppRoleType;
}

/**
 * JWT Token payload interface (User-Centric Model)
 *
 * The user is at the center - their access is determined by memberships.
 */
export interface TokenPayload {
  // User identity
  userId: string;
  email: string;
  name: string;

  // Platform-level access (if user has platform membership)
  platformRole?: PlatformRoleType;

  // Current organization context (if user is operating within an org)
  orgContext?: OrgContext;

  // Current app context (if user is operating within an app)
  appContext?: AppContext;

  // Computed effective scopes for the current context
  // This is what middleware uses for permission checks
  effectiveScopes: string[];

  // User has organizations (for UI navigation)
  hasOrganizations?: boolean;

  // Token metadata
  iat?: number;
  exp?: number;
}

/**
 * User info for auth responses
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  hasPlatformAccess: boolean;
  platformRole?: PlatformRoleType;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    roleType: OrgRoleType;
    isDefault: boolean;
  }>;
}

/**
 * Authentication response interface
 */
export interface AuthResponse {
  success: boolean;
  user: AuthUser;
  redirect: string;
  requiresTwoFactor?: boolean;
}

/**
 * Generate an access token with short expiration using RSA private key
 * @param payload - Token payload containing user information
 * @returns Promise<string> - Signed JWT access token
 */
export async function generateAccessToken(
  payload: Omit<TokenPayload, "iat" | "exp">
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = parseTimeToSeconds(JWT_ACCESS_EXPIRES_IN);

  const tokenPayload: TokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
  };

  try {
    const privateKey = await loadPrivateKey();
    const { sign } = await getJWTUtils();
    const token = await sign(tokenPayload, privateKey, "RS256");
    return token;
  } catch (error) {
    throw new Error("Failed to generate access token");
  }
}

/**
 * Generate a refresh token with longer expiration using RSA private key
 * @param payload - Token payload containing user information
 * @returns Promise<string> - Signed JWT refresh token
 */
export async function generateRefreshToken(
  payload: Omit<TokenPayload, "iat" | "exp">
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = parseTimeToSeconds(JWT_REFRESH_EXPIRES_IN);

  const tokenPayload: TokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
  };

  try {
    const privateKey = await loadPrivateKey();
    const { sign } = await getJWTUtils();
    const token = await sign(tokenPayload, privateKey, "RS256");
    return token;
  } catch (error) {
    throw new Error("Failed to generate refresh token");
  }
}

/**
 * Verify an access token using RSA public key
 * @param token - JWT token to verify
 * @returns Promise<TokenPayload> - Decoded token payload
 */
export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  try {
    const publicKey = await loadPublicKey();
    const { verify } = await getJWTUtils();
    const payload = (await verify(token, publicKey, "RS256")) as TokenPayload;
    return payload;
  } catch (error) {
    throw new Error("Invalid or expired access token");
  }
}

/**
 * Verify a refresh token using RSA public key
 * @param token - JWT token to verify
 * @returns Promise<TokenPayload> - Decoded token payload
 */
export async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  try {
    const publicKey = await loadPublicKey();
    const { verify } = await getJWTUtils();
    const payload = (await verify(token, publicKey, "RS256")) as TokenPayload;
    return payload;
  } catch (error) {
    throw new Error("Invalid or expired refresh token");
  }
}

/**
 * Hono middleware to verify access tokens
 * @param c - Hono context
 * @param next - Next middleware function
 */
export async function verifyAccessTokenMiddleware(
  c: Context,
  next: () => Promise<void>
) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const payload = await verifyAccessToken(token);
    c.set("user", payload);
    await next();
  } catch (error) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}

/**
 * Hono middleware to verify refresh tokens
 * @param c - Hono context
 * @param next - Next middleware function
 */
export async function verifyRefreshTokenMiddleware(
  c: Context,
  next: () => Promise<void>
) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const payload = await verifyRefreshToken(token);
    c.set("user", payload);
    await next();
  } catch (error) {
    return c.json({ error: "Invalid or expired refresh token" }, 401);
  }
}

// =============================================================================
// Token Builder Utilities
// =============================================================================

import { buildEffectiveScopes, type MembershipContext } from './scopes';
import type {
  User,
  PlatformMembership,
  OrganizationMembership,
  AppMembership,
  Organization,
} from '@prisma/client';

/**
 * User with memberships loaded
 */
export interface UserWithMemberships extends User {
  platformMembership: PlatformMembership | null;
  organizationMemberships: (OrganizationMembership & {
    organization: Organization;
  })[];
  appMemberships?: AppMembership[];
}

/**
 * Context for building token payload
 */
export interface TokenBuildContext {
  /** Current organization ID (if user is in org context) */
  orgId?: string;
  /** Current app ID (if user is in app context) */
  appId?: string;
  /** Whether the current app allows user API keys */
  allowUserApiKeys?: boolean;
}

/**
 * Build token payload for a user based on their memberships
 *
 * @param user - User with memberships loaded
 * @param context - Optional context for org/app specific tokens
 * @returns TokenPayload ready for signing
 */
export function buildTokenPayload(
  user: UserWithMemberships,
  context: TokenBuildContext = {}
): Omit<TokenPayload, 'iat' | 'exp'> {
  // Find current org membership if orgId specified
  const currentOrgMembership = context.orgId
    ? user.organizationMemberships.find(m => m.organizationId === context.orgId && m.isActive)
    : user.organizationMemberships.find(m => m.isDefault && m.isActive) ||
      user.organizationMemberships.find(m => m.isActive);

  // Find current app membership if appId specified
  const currentAppMembership = context.appId && user.appMemberships
    ? user.appMemberships.find(m => m.appId === context.appId && m.isActive)
    : undefined;

  // Build org context
  const orgContext: OrgContext | undefined = currentOrgMembership
    ? {
        orgId: currentOrgMembership.organizationId,
        orgSlug: currentOrgMembership.organization.slug,
        roleType: currentOrgMembership.roleType,
      }
    : undefined;

  // Build app context
  const appContext: AppContext | undefined = currentAppMembership
    ? {
        appId: currentAppMembership.appId,
        roleType: currentAppMembership.roleType,
      }
    : undefined;

  // Build effective scopes
  const membershipContext: MembershipContext = {
    platformMembership: user.platformMembership,
    organizationMemberships: user.organizationMemberships,
    appMemberships: user.appMemberships,
    currentOrgId: context.orgId || currentOrgMembership?.organizationId,
    currentAppId: context.appId,
    allowUserApiKeys: context.allowUserApiKeys,
  };

  const effectiveScopes = buildEffectiveScopes(membershipContext);

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    platformRole: user.platformMembership?.isActive
      ? user.platformMembership.roleType
      : undefined,
    orgContext,
    appContext,
    effectiveScopes,
    hasOrganizations: user.organizationMemberships.length > 0,
  };
}

/**
 * Build auth user object for response
 */
export function buildAuthUser(user: UserWithMemberships): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    hasPlatformAccess: user.platformMembership?.isActive ?? false,
    platformRole: user.platformMembership?.isActive
      ? user.platformMembership.roleType
      : undefined,
    organizations: user.organizationMemberships
      .filter(m => m.isActive)
      .map(m => ({
        id: m.organizationId,
        name: m.organization.name,
        slug: m.organization.slug,
        roleType: m.roleType,
        isDefault: m.isDefault,
      })),
  };
}

/**
 * Determine redirect URL after login based on user's memberships
 */
export function determineLoginRedirect(user: UserWithMemberships): string {
  // Platform admin with no orgs goes to admin dashboard
  if (user.platformMembership?.isActive && user.organizationMemberships.length === 0) {
    return '/admin';
  }

  // User with orgs goes to their default org or first org
  const defaultOrg = user.organizationMemberships.find(m => m.isDefault && m.isActive);
  if (defaultOrg) {
    return `/org/${defaultOrg.organization.slug}`;
  }

  const firstOrg = user.organizationMemberships.find(m => m.isActive);
  if (firstOrg) {
    return `/org/${firstOrg.organization.slug}`;
  }

  // App-only user goes to dashboard (app will handle redirect)
  if (user.appMemberships && user.appMemberships.length > 0) {
    return '/dashboard';
  }

  // Fallback
  return '/dashboard';
}
