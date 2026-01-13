import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { db } from "@z0/utils/db/client";
import app from "../src/index";
import { hashPassword, generateAccessToken, type TokenPayload } from "@z0/utils/auth"; // Explicitly import type

const TEST_ORG_SLUG = "app-test-org";
const TEST_ADMIN_EMAIL = "org-admin@example.com";
const TEST_PASSWORD = "Password123!";
const TEST_USER_EMAIL = "regular-user@example.com";

describe("Organization & App Management", () => {
    let orgId: string;
    let adminToken: string;
    let userToken: string;

    beforeAll(async () => {
        // Clean up
        await db.user.deleteMany({ where: { email: { in: [TEST_ADMIN_EMAIL, TEST_USER_EMAIL] } } });
        await db.organization.deleteMany({ where: { slug: TEST_ORG_SLUG } });

        // 1. Create Organization (via DB directly to bypass platform auth need here)
        const org = await db.organization.create({
            data: {
                name: "App Test Org",
                slug: TEST_ORG_SLUG,
            }
        });
        orgId = org.id;

        // 2. Create Org Admin
        const hashedPassword = await hashPassword(TEST_PASSWORD);
        const admin = await db.user.create({
            data: {
                organizationId: org.id,
                email: TEST_ADMIN_EMAIL,
                password: hashedPassword,
                name: "Org Admin",
                legacyRole: "ORG_ADMIN", // using legacyRole logic for now as per Auth waterfall
            }
        });

        // 3. Create Regular User (should NOT have access to create apps)
        const user = await db.user.create({
            data: {
                organizationId: org.id,
                email: TEST_USER_EMAIL,
                password: hashedPassword,
                name: "Regular User",
                legacyRole: "APP_USER"
            }
        });

        // 4. Generate Tokens (using utils)
        // We mock the TokenPayload manually to match what the server would issue
        const adminPayload = {
            userId: admin.id,
            email: admin.email,
            role: "ORG_ADMIN",
            orgId: org.id,
            type: "user" as const
        };
        adminToken = await generateAccessToken(adminPayload);

        const userPayload = {
            userId: user.id,
            email: user.email,
            role: "APP_USER",
            orgId: org.id,
            type: "user" as const
        };
        userToken = await generateAccessToken(userPayload);
    });

    afterAll(async () => {
        await db.user.deleteMany({ where: { email: { in: [TEST_ADMIN_EMAIL, TEST_USER_EMAIL] } } });
        await db.organization.deleteMany({ where: { slug: TEST_ORG_SLUG } });
    });

    it("should create an app as Org Admin", async () => {
        const res = await app.request(`/api/v1/orgs/${orgId}/apps`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${adminToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: "Test App 1",
                slug: "test-app-1",
                description: "My cool app"
            })
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.apiKey).toStartWith("sk_live_");
        expect(body.data.apiSecret).toBeDefined();
    });

    it("should list apps as Org Admin", async () => {
        const res = await app.request(`/api/v1/orgs/${orgId}/apps`, {
            headers: { "Authorization": `Bearer ${adminToken}` }
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("should DENY app creation for Regular User", async () => {
        const res = await app.request(`/api/v1/orgs/${orgId}/apps`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${userToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: "Hacker App",
                slug: "hacker-app"
            })
        });

        expect(res.status).toBe(403);
    });

    it("should DENY access to other org's apps (cross-tenant check)", async () => {
        // Create another org just ID
        const otherOrg = await db.organization.create({ data: { name: "Other", slug: "other-123" } });

        const res = await app.request(`/api/v1/orgs/${otherOrg.id}/apps`, {
            headers: { "Authorization": `Bearer ${adminToken}` }
        });

        await db.organization.delete({ where: { id: otherOrg.id } });

        expect(res.status).toBe(403);
    });
});
