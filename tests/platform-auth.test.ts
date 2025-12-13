import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { db } from "@z0/utils/db/client";
import app from "../src/index";
import { hashPassword } from "@z0/utils/auth";

const TEST_EMAIL = "platform-test@example.com";
const TEST_PASSWORD = "Password123!";

describe("Platform Auth & Management", () => {
    let adminId: string;
    let authToken: string;

    beforeAll(async () => {
        // Clean up
        await db.platformManager.deleteMany({ where: { email: TEST_EMAIL } });

        // Create Test Platform Manager
        const hashedPassword = await hashPassword(TEST_PASSWORD);
        const admin = await db.platformManager.create({
            data: {
                email: TEST_EMAIL,
                password: hashedPassword,
                name: "Test Admin",
                organization: "Z0 Corp",
                roleType: "SUPER_ADMIN",
                scopes: ["*"]
            }
        });
        adminId = admin.id;
    });

    afterAll(async () => {
        await db.platformManager.deleteMany({ where: { email: TEST_EMAIL } });
        await db.organization.deleteMany({ where: { slug: "test-org-123" } });
    });

    it("should login successfully as Platform Manager", async () => {
        const res = await app.request("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: TEST_EMAIL,
                password: TEST_PASSWORD
            })
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.user.email).toBe(TEST_EMAIL);
        expect(body.user.type).toBe("platform");

        // Check Cookies
        const cookies = res.headers.get("Set-Cookie");
        expect(cookies).toContain("access_token");

        // Extract token for next tests (simplified extraction)
        // In real integration test we might need a cookie jar, but here we can just parse
        const match = cookies?.match(/access_token=([^;]+)/);
        if (match) authToken = match[1];
        expect(authToken).toBeDefined();
    });

    it("should list organizations (empty initially)", async () => {
        const res = await app.request("/api/v1/platform/organizations", {
            headers: { "Authorization": `Bearer ${authToken}` }
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
    });

    it("should create a new organization", async () => {
        const res = await app.request("/api/v1/platform/organizations", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: "Test Organization 123",
                slug: "test-org-123",
                description: "Created by test"
            })
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.slug).toBe("test-org-123");
    });

    it("should fail to create org with same slug", async () => {
        const res = await app.request("/api/v1/platform/organizations", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: "Duplicate Org",
                slug: "test-org-123",
            })
        });

        expect(res.status).toBe(409); // Conflict
    });
});
