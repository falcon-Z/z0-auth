import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { db } from "@z0/utils/db/client";
import app from "../src/index";
import { hashPassword } from "@z0/utils/auth";

const TEST_ORG_SLUG = "auth-flow-test-org";
const TEST_USER_EMAIL = "newuser@example.com";
const TEST_PASSWORD = "Password123!";

describe("User Authentication Flow", () => {
    let orgId: string;

    beforeAll(async () => {
        // Cleanup
        await db.user.deleteMany({ where: { email: TEST_USER_EMAIL } });
        await db.organization.deleteMany({ where: { slug: TEST_ORG_SLUG } });

        // Create Test Org
        const org = await db.organization.create({
            data: {
                name: "Auth Flow Test",
                slug: TEST_ORG_SLUG,
            }
        });
        orgId = org.id;
    });

    afterAll(async () => {
        await db.user.deleteMany({ where: { email: TEST_USER_EMAIL } });
        await db.organization.deleteMany({ where: { slug: TEST_ORG_SLUG } });
    });

    it("should register a new user successfully", async () => {
        const res = await app.request("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: TEST_USER_EMAIL,
                password: TEST_PASSWORD,
                name: "New User",
                organizationId: orgId
            })
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.email).toBe(TEST_USER_EMAIL);
        expect(body.data.role).toBe("APP_USER");
    });

    it("should fail to register same email again", async () => {
        const res = await app.request("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: TEST_USER_EMAIL,
                password: TEST_PASSWORD,
                name: "Duplicate User",
                organizationId: orgId
            })
        });

        expect(res.status).toBe(409);
    });

    it("should login with new credentials (unified login)", async () => {
        const res = await app.request("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: TEST_USER_EMAIL,
                password: TEST_PASSWORD
            })
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.user.email).toBe(TEST_USER_EMAIL);
        expect(body.user.orgId).toBe(orgId);
        expect(body.user.type).toBe("organization");

        // Check Cookies
        const cookies = res.headers.get("Set-Cookie");
        expect(cookies).toContain("access_token");
    });
});
