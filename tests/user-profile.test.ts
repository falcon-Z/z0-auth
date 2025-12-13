import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { db } from "@z0/utils/db/client";
import app from "../src/index";
import { hashPassword, generateAccessToken } from "@z0/utils/auth";
import { validatePassword } from "@z0/utils/password-validation";

const EMAIL = "profile-test@z0.com";
const OLD_PASS = "OldPass123!";
const NEW_PASS = "NewPass925$";
const ORG_SLUG = "profile-org";

describe("User Profile & Security", () => {
    let token: string;
    let userId: string;

    beforeAll(async () => {
        // Cleanup
        await db.user.deleteMany({ where: { email: EMAIL } });
        await db.organization.deleteMany({ where: { slug: ORG_SLUG } });

        // Create Org
        const org = await db.organization.create({
            data: { name: "Profile Org", slug: ORG_SLUG }
        });

        // Create User
        const hashedPassword = await hashPassword(OLD_PASS);
        const user = await db.user.create({
            data: {
                email: EMAIL,
                password: hashedPassword,
                name: "Original Name",
                organizationId: org.id
            }
        });
        userId = user.id;

        token = await generateAccessToken({
            userId: user.id,
            email: user.email,
            roleType: "user", // or role
            type: "user",
            orgId: org.id
        });
    });

    afterAll(async () => {
        await db.user.deleteMany({ where: { email: EMAIL } });
        await db.organization.deleteMany({ where: { slug: ORG_SLUG } });
    });

    it("should fetch user profile", async () => {
        const res = await app.request("/api/v1/users/me", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.email).toBe(EMAIL);
        expect(body.data.name).toBe("Original Name");
        expect(body.data.organization.slug).toBe(ORG_SLUG);
    });

    it("should update user profile", async () => {
        const res = await app.request("/api/v1/users/me", {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name: "Updated Name" })
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.name).toBe("Updated Name");
    });

    it("should fail validation for weak new password", async () => {
        const res = await app.request("/api/v1/users/change-password", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                currentPassword: OLD_PASS,
                newPassword: "weak"
            })
        });
        expect(res.status).toBe(400); // Validation error
    });

    it("should fail if current password incorrect", async () => {
        const res = await app.request("/api/v1/users/change-password", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                currentPassword: "WrongPassword!",
                newPassword: NEW_PASS
            })
        });
        expect(res.status).toBe(403);
    });

    it("should change password successfully", async () => {
        const res = await app.request("/api/v1/users/change-password", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                currentPassword: OLD_PASS,
                newPassword: NEW_PASS
            })
        });
        expect(res.status).toBe(200);
    });

    // Optional: Verify login with new password?
    // Not strictly needed if unit test covers the DB update, but good for integration completeness.
});
