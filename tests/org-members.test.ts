import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { db } from "@z0/utils/db/client";
import app from "../src/index";
import { hashPassword, generateAccessToken } from "@z0/utils/auth";

const PLATFORM_ADMIN_EMAIL = "platform-mgr@z0.com";
const ORG_SLUG = "member-test-org";
const NEW_MEMBER_EMAIL = "newmember@z0.com";

describe("Organization Member Management", () => {
    let platformToken: string;
    let orgId: string;
    let newUserId: string;

    beforeAll(async () => {
        // Cleanup
        await db.platformManager.deleteMany({ where: { email: PLATFORM_ADMIN_EMAIL } });
        await db.organization.deleteMany({ where: { slug: ORG_SLUG } });
        await db.user.deleteMany({ where: { email: NEW_MEMBER_EMAIL } });

        // Create Platform Admin
        const hashedPassword = await hashPassword("Password123!");
        const admin = await db.platformManager.create({
            data: {
                email: PLATFORM_ADMIN_EMAIL,
                password: hashedPassword,
                name: "Platform Mgr",
                organization: "Z0",
                roleType: "SUPER_ADMIN",
                scopes: ["*"]
            }
        });

        platformToken = await generateAccessToken({
            userId: admin.id,
            email: admin.email,
            roleType: admin.roleType,
            type: "platform_manager"
        });

        // Create Org
        const org = await db.organization.create({
            data: {
                name: "Member Test Org",
                slug: ORG_SLUG,
                status: "ACTIVE"
            }
        });
        orgId = org.id;
    });

    afterAll(async () => {
        await db.platformManager.deleteMany({ where: { email: PLATFORM_ADMIN_EMAIL } });
        await db.organization.deleteMany({ where: { slug: ORG_SLUG } });
    });

    it("should add a new member to the organization", async () => {
        const res = await app.request(`/api/v1/orgs/${orgId}/members`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${platformToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: NEW_MEMBER_EMAIL,
                name: "New Mem",
                password: "Xy9#mP2$vL5@kQ",
                role: "ORG_USER"
            })
        });

        const body = await res.json();
        if (res.status !== 201) console.log(body);

        expect(res.status).toBe(201);
        expect(body.data.email).toBe(NEW_MEMBER_EMAIL);
        newUserId = body.data.id;
    });

    it("should list members", async () => {
        const res = await app.request(`/api/v1/orgs/${orgId}/members`, {
            headers: { "Authorization": `Bearer ${platformToken}` }
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data).toBeArray();
        expect(body.data.length).toBeGreaterThanOrEqual(1);
        const found = body.data.find((u: any) => u.email === NEW_MEMBER_EMAIL);
        expect(found).toBeDefined();
    });

    it("should remove the member", async () => {
        const res = await app.request(`/api/v1/orgs/${orgId}/members/${newUserId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${platformToken}` }
        });

        expect(res.status).toBe(200);

        // Verify Check
        const check = await db.user.findUnique({ where: { id: newUserId } });
        expect(check).toBeNull();
    });
});
