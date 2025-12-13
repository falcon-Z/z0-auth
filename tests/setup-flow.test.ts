import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { db } from "@z0/utils/db/client";
import app from "../src/index";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

// Mock Config to allow setup
const configPath = join(process.cwd(), "src/config.json");
const originalConfig = readFileSync(configPath, "utf-8");

describe("System Setup Flow", () => {

    beforeAll(async () => {
        // Reset Config
        writeFileSync(configPath, JSON.stringify({ SuperAdminConfigured: false }));
        // Clean DB
        await db.platformManager.deleteMany({ where: { roleType: "SUPER_ADMIN" } });
        await db.organization.deleteMany({ where: { slug: "my-test-org" } });
    });

    afterAll(async () => {
        // Restore Config
        writeFileSync(configPath, originalConfig);
        await db.platformManager.deleteMany({ where: { roleType: "SUPER_ADMIN" } });
        await db.organization.deleteMany({ where: { slug: "my-test-org" } });
    });

    it("should setup super admin AND default organization", async () => {
        const res = await app.request("/api/setup/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: "admin@example.com",
                password: "Xy9#mP2$vL5@kQ",
                name: "Super Admin",
                organization: "My Test Org"
            })
        });

        const body = await res.json();
        if (res.status !== 200) {
            console.log("Setup failed with:", JSON.stringify(body, null, 2));
        }
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);

        // Verify Org Creation
        const org = await db.organization.findUnique({
            where: { slug: "my-test-org" }
        });
        expect(org).not.toBeNull();
        expect(org?.name).toBe("My Test Org");
    });
});
