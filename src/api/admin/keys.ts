import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { Hono } from "hono";
import {
    Logger,
    DatabaseErrorHandler,
    ErrorResponseBuilder,
    RequestContext
} from "@z0/utils/error-handling";
import { verifyAccessTokenMiddleware } from "@z0/utils/auth";
import { generateKeyPair } from "crypto";
import { promisify } from "util";

const generateKeyPairAsync = promisify(generateKeyPair);

const KEYS_DIR = join(process.cwd(), "keys");
const PUBLIC_KEY_PATH = join(KEYS_DIR, "jwt-public.key");
const PRIVATE_KEY_PATH = join(KEYS_DIR, "jwt-private.key");

// Helper: Convert PEM to JWK
const pemToJwk = (pem: string, kid: string = "default") => {
    // Simplified JWK conversion for RSA string
    // In real prod, use a library or proper ASN.1 parsing. 
    // Here we assume standard PKCS#8/SPKI PEM format from Node's crypto.
    // Actually, `crypto.createPublicKey(pem).export({ format: 'jwk' })` is best in Node.
    const { createPublicKey } = require('crypto');
    try {
        const key = createPublicKey(pem);
        const jwk = key.export({ format: 'jwk' });
        return { ...jwk, kid, use: 'sig', alg: 'RS256' };
    } catch (e) {
        return null;
    }
};

const adminKeys = new Hono();

// Middleware: Require Platform Manager (SUPER_ADMIN or SECURITY_MANAGER)
const requireKeyAdmin = async (c: any, next: any) => {
    const user = c.get('user');
    if (!user || user.type !== 'platform_manager') {
        return c.json(ErrorResponseBuilder.authorization("Access denied. Platform Managers only."), 403);
    }
    // Check specific roles if needed. supporting SUPER_ADMIN for now.
    if (user.roleType !== "SUPER_ADMIN" && user.roleType !== "SECURITY_MANAGER") {
        return c.json(ErrorResponseBuilder.authorization("Access denied. Insufficient privileges."), 403);
    }
    await next();
};

/**
 * GET /.well-known/jwks.json
 * Public endpoint to expose JWKS
 */
adminKeys.get("/.well-known/jwks.json", async (c) => {
    try {
        if (!existsSync(PUBLIC_KEY_PATH)) {
            return c.json({ keys: [] });
        }
        const pem = await readFile(PUBLIC_KEY_PATH, 'utf8');
        const jwk = pemToJwk(pem, "sig-1"); // ID "sig-1" is arbitrary for now

        return c.json({
            keys: jwk ? [jwk] : []
        });
    } catch (e) {
        return c.json({ keys: [] }, 500);
    }
});

/**
 * GET /api/admin/keys
 * List active keys status
 */
adminKeys.get("/", verifyAccessTokenMiddleware, requireKeyAdmin, async (c) => {
    try {
        const exists = existsSync(PUBLIC_KEY_PATH);
        // We can check modification time or load it
        return c.json({
            success: true,
            keys: [{
                id: "sig-1",
                type: "RSA",
                status: exists ? "active" : "missing",
                location: "disk"
            }]
        });

    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to fetch keys"), 500);
    }
});

// Generate/Rotate keys (Overwrites existing on disk for now)
adminKeys.post("/generate", verifyAccessTokenMiddleware, requireKeyAdmin, async (c) => {
    try {
        // Generate RSA Keypair
        const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        // Ensure dir
        await require('fs/promises').mkdir(KEYS_DIR, { recursive: true });

        await writeFile(PRIVATE_KEY_PATH, privateKey, 'utf8');
        await writeFile(PUBLIC_KEY_PATH, publicKey, 'utf8');

        Logger.info("Admin rotated Platform Keys");

        return c.json({ success: true, message: "New keypair generated and saved.", kid: "sig-1" });
    } catch (e: any) {
        return c.json(ErrorResponseBuilder.system("Key generation failed", "KEY_GEN_FAILED"), 500);
    }
});

export default adminKeys;
