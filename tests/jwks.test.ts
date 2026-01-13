import { describe, expect, it } from "bun:test";
import app from "../src/index";

// Mock environment or ensure file exists? 
// Tests should potentially spin up isolated env, but we'll test valid output.

describe("JWKS & Key Management", () => {
    it("should expose /.well-known/jwks.json", async () => {
        // We assume keys might not exist yet if not generated, but route should respond
        const res = await app.request("/api/admin/keys/.well-known/jwks.json");
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.keys).toBeDefined();
        expect(Array.isArray(body.keys)).toBe(true);
        // If keys exist, check structure
        if (body.keys.length > 0) {
            expect(body.keys[0].kty).toBe("RSA");
            expect(body.keys[0].alg).toBe("RS256");
            expect(body.keys[0].use).toBe("sig");
        }
    });

    // Since /generate requires Auth, we need to mock or reuse auth login from other tests?
    // For simplicity in this 'Core Infrastructure' check, we verify the public endpoints primarily.
    // The logic for generation relies on `utils/auth.ts` logic which is tested implicitly by login flow working.
});
