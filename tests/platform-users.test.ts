import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { db } from "@z0/utils/db/client";
import app from "../src/index";
import { hashPassword, generateAccessToken, buildTokenPayload, type UserWithMemberships } from "@z0/utils/auth";

const SUPER_ADMIN_EMAIL = "super@z0.com";
const NEW_ADMIN_EMAIL = "support@z0.com";
const PASSWORD = "Password123!";

describe("Platform Users Management", () => {
    let superToken: string;
    let superUserId: string;
    let newUserId: string;

    beforeAll(async () => {
        // Cleanup - delete users and their memberships
        const usersToDelete = await db.user.findMany({
            where: { email: { in: [SUPER_ADMIN_EMAIL, NEW_ADMIN_EMAIL] } },
            select: { id: true }
        });

        for (const user of usersToDelete) {
            await db.platformMembership.deleteMany({
                where: { userId: user.id }
            });
        }

        await db.user.deleteMany({
            where: { email: { in: [SUPER_ADMIN_EMAIL, NEW_ADMIN_EMAIL] } }
        });

        // Create Super Admin user with platform membership
        const hashedPassword = await hashPassword(PASSWORD);
        const superAdmin = await db.user.create({
            data: {
                email: SUPER_ADMIN_EMAIL,
                password: hashedPassword,
                name: "Super Admin",
                status: "ACTIVE",
                platformMembership: {
                    create: {
                        roleType: "SUPER_ADMIN",
                        scopes: ["*"],
                        isActive: true,
                    }
                }
            },
            include: {
                platformMembership: true,
                organizationMemberships: {
                    where: { isActive: true },
                    include: { organization: true },
                },
                appMemberships: {
                    where: { isActive: true },
                },
            },
        });

        superUserId = superAdmin.id;

        // Build token using the new token builder
        const tokenPayload = buildTokenPayload(superAdmin as UserWithMemberships);
        superToken = await generateAccessToken(tokenPayload);
    });

    afterAll(async () => {
        // Cleanup - delete users and their memberships
        const usersToDelete = await db.user.findMany({
            where: { email: { in: [SUPER_ADMIN_EMAIL, NEW_ADMIN_EMAIL] } },
            select: { id: true }
        });

        for (const user of usersToDelete) {
            await db.platformMembership.deleteMany({
                where: { userId: user.id }
            });
        }

        await db.user.deleteMany({
            where: { email: { in: [SUPER_ADMIN_EMAIL, NEW_ADMIN_EMAIL] } }
        });
    });

    it("should list platform users", async () => {
        const res = await app.request("/api/v1/platform/users", {
            headers: { "Authorization": `Bearer ${superToken}` }
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("should create a new support admin", async () => {
        const res = await app.request("/api/v1/platform/users", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${superToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: NEW_ADMIN_EMAIL,
                name: "Support Guy",
                password: "Xy9#mP2$vL5@kQ",
                roleType: "SUPPORT_MANAGER"
            })
        });

        const body = await res.json();
        if (res.status !== 201) console.log(body);

        expect(res.status).toBe(201);
        newUserId = body.data.userId;
        expect(body.data.email).toBe(NEW_ADMIN_EMAIL);
    });

    it("should fail to create duplicate user", async () => {
        const res = await app.request("/api/v1/platform/users", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${superToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: NEW_ADMIN_EMAIL,
                name: "Support Guy 2",
                password: "Xy9#mP2$vL5@kQ",
                roleType: "SUPPORT_MANAGER"
            })
        });
        expect(res.status).toBe(409);
    });

    it("should delete the new user", async () => {
        const res = await app.request(`/api/v1/platform/users/${newUserId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${superToken}` }
        });
        expect(res.status).toBe(200);

        // Verify user membership is deactivated
        const check = await db.platformMembership.findUnique({
            where: { userId: newUserId }
        });
        expect(check?.isActive).toBe(false);
    });
});
