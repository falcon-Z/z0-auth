import { db } from "@z0/utils/db/client";
import { ErrorResponseBuilder, Logger } from "@z0/utils/error-handling";
import type { Context, Next } from "hono";

/**
 * Middleware: Verify API Key
 * Expects 'x-api-key' header.
 * Validates key exists and is active.
 * Enforces Allowed Origins if configured for the app.
 */
export const verifyApiKeyMiddleware = async (c: Context, next: Next) => {
    const apiKey = c.req.header("x-api-key");
    const origin = c.req.header("origin") || "";
    const referer = c.req.header("referer") || "";

    if (!apiKey) {
        // If no key, maybe fall through to other auth methods? 
        // Or strict fail if this middleware is expressly used?
        // Usually strict fail.
        return c.json(ErrorResponseBuilder.authentication("API Key required", "API_KEY_REQUIRED"), 401);
    }

    try {
        // 1. Find App by Key
        const app = await db.app.findFirst({
            where: {
                apiKey: apiKey,
                status: "ACTIVE"
            },
            include: {
                allowedOrigins: true
            }
        });

        if (!app) {
            // Slow down? 
            return c.json(ErrorResponseBuilder.authentication("Invalid API Key", "INVALID_API_KEY"), 401);
        }

        // 2. Check Origin Constraints
        // If app has allowed origins defined, request MUST match.
        // Check both Origin and Referer? Usually Origin is more reliable for CORS.
        // If server-to-server (no origin), we might check IP? (Scope creep, user said "allowed or blocked domains")

        const allowedOrigins = app.allowedOrigins;

        if (allowedOrigins.length > 0) {
            // If Origin header is missing (e.g. backend script), and origins are restricted, we might block or allow?
            // "app origin allowed or blocked domains" implies browser usage mostly.
            // If we want to support backend scripts, they usually don't send Origin.
            // Let's enforce ONLY if Origin is present OR if we want Strict mode.
            // For security, if restrict origins is ON, we expect a matching origin.

            // Match logic: Simple string match or wildcard.
            // Schema has `isWildcard` and `pattern`.

            let isAllowed = false;

            if (!origin) {
                // Case: Non-browser request. 
                // If strict domain restriction is enabled, we might block.
                // But usually API Keys are used from backends too.
                // Let's Log warning but allow? Or strictly block?
                // "app access restrictions".
                // Let's assume for now: If origins defined, and NO origin header, we ALLOW (backend).
                // If Origin header PRESENT, it MUST match.
                isAllowed = true;
            } else {
                // Check against list
                for (const allowed of allowedOrigins) {
                    if (!allowed.isActive) continue;

                    if (allowed.isWildcard && allowed.pattern) {
                        // Simple RegExp check
                        // Warning: User input regex is dangerous. 
                        // We should compile carefully or use simple glob.
                        // Schema says "pattern" string.
                        try {
                            const regex = new RegExp(allowed.pattern); // DANGEROUS if pattern not sanitized?
                            // Ideally we use a fast glob matcher.
                            if (regex.test(origin)) {
                                isAllowed = true;
                                break;
                            }
                        } catch (e) {
                            // invalid regex
                        }
                    } else {
                        if (allowed.origin === origin) {
                            isAllowed = true;
                            break;
                        }
                    }
                }
            }

            if (!isAllowed && origin) {
                Logger.warn("Blocked request from unauthorized origin", {
                    appId: app.id,
                    origin,
                    apiKeyPrefix: apiKey.substring(0, 10)
                });
                return c.json(ErrorResponseBuilder.authorization("Origin not allowed", "ORIGIN_DENIED"), 403);
            }
        }

        // 3. Attach App to Context
        c.set('app', app);

        // Log usage (async, don't await)
        // Could update `lastUsedAt` on App or Key?
        // App schema has no lastUsed.

        await next();

    } catch (error) {
        console.error(error);
        return c.json(ErrorResponseBuilder.system("API Key validation failed"), 500);
    }
};
