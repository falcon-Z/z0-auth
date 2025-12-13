import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { db } from "@z0/utils/db/client";
import app from "../src/index";
import { hashPassword } from "@z0/utils/auth";
import { generateAccessToken } from "@z0/utils/auth";

const SUPER_ADMIN_EMAIL = "super@z0.com";
const NEW_ADMIN_EMAIL = "support@z0.com";
const PASSWORD = "Password123!";

describe("Platform Users Management", () => {
    let superToken: string;
    let newUserId: string;

    beforeAll(async () => {
        // Cleanup
        await db.platformManager.deleteMany({
            where: { email: { in: [SUPER_ADMIN_EMAIL, NEW_ADMIN_EMAIL] } }
        });

        // Create Super Admin manually
        const hashedPassword = await hashPassword(PASSWORD);
        const superAdmin = await db.platformManager.create({
            data: {
                email: SUPER_ADMIN_EMAIL,
                password: hashedPassword,
                name: "Super Admin",
                organization: "Z0",
                roleType: "SUPER_ADMIN",
                scopes: ["*"]
            }
        });

        // Mint Token
        superToken = await generateAccessToken({
            userId: superAdmin.id,
            email: superAdmin.email,
            roleType: superAdmin.roleType,
            type: "platform_manager"
        });
    });

    afterAll(async () => {
        await db.platformManager.deleteMany({
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
                roleType: "SUPER_ADMIN" // Schema limitation might strict enum
            })
        });

        const body = await res.json();
        if (res.status !== 201) console.log(body);

        expect(res.status).toBe(201);
        newUserId = body.data.id;
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
                roleType: "SUPER_ADMIN"
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

        // Verify gone
        const check = await db.platformManager.findUnique({
            where: { id: newUserId }
        });
        expect(check).toBeNull();
    });
});
