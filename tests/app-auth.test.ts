import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { db } from "@z0/utils/db/client";
import { Hono } from "hono";
import { verifyApiKeyMiddleware } from "@z0/utils/app-auth";

// Setup specialized app for testing middleware in isolation
const testApp = new Hono();
testApp.use("/protected", verifyApiKeyMiddleware);
testApp.get("/protected", (c) => c.json({ success: true, app: c.get('app').name }));

const API_KEY = "sk_live_TESTKEY123456";
const APP_SLUG = "middleware-test-app";

describe("App Authentication Middleware", () => {

    beforeAll(async () => {
        // Clean
        await db.app.deleteMany({ where: { slug: APP_SLUG } });
        await db.organization.deleteMany({ where: { slug: "middleware-org" } });

        // Create Org
        const org = await db.organization.create({
            data: { name: "MW Org", slug: "middleware-org" }
        });

        // Create App
        await db.app.create({
            data: {
                name: "Test App",
                slug: APP_SLUG,
                organizationId: org.id,
                apiKey: API_KEY, // Manually set for test
                apiSecret: "sec_secret"
            }
        });
    });

    afterAll(async () => {
        await db.app.deleteMany({ where: { slug: APP_SLUG } });
        await db.organization.deleteMany({ where: { slug: "middleware-org" } });
    });

    it("should allow request with valid key", async () => {
        const res = await testApp.request("/protected", {
            headers: { "x-api-key": API_KEY }
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.app).toBe("Test App");
    });

    it("should reject invalid key", async () => {
        const res = await testApp.request("/protected", {
            headers: { "x-api-key": "sk_live_WRONG" }
        });
        expect(res.status).toBe(401);
    });

    it("should reject missing key", async () => {
        const res = await testApp.request("/protected");
        expect(res.status).toBe(401);
    });

    it("should enforce allowed origins", async () => {
        // Add origin constraint
        const app = await db.app.findFirst({ where: { apiKey: API_KEY } });
        await db.allowedOrigin.create({
            data: {
                appId: app!.id,
                origin: "https://trusted.com"
            }
        });

        // Request from Trusted
        const res1 = await testApp.request("/protected", {
            headers: {
                "x-api-key": API_KEY,
                "Origin": "https://trusted.com"
            }
        });
        expect(res1.status).toBe(200);

        // Request from Untrusted
        const res2 = await testApp.request("/protected", {
            headers: {
                "x-api-key": API_KEY,
                "Origin": "https://evil.com"
            }
        });
        expect(res2.status).toBe(403);
    });

});
