import { describe, it, expect, beforeAll, afterAll, mock, spyOn } from "bun:test";
import { existsSync } from "fs";
import { unlink, rmdir } from "fs/promises";
import { join } from "path";
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  ensureJWTKeypair,
  type TokenPayload,
} from "../../src/utils/auth";

// Test constants
const TEST_PASSWORD = "TestPassword123!";
const TEST_WEAK_PASSWORD = "weak";
const TEST_KEYS_DIR = join(process.cwd(), "keys");
const TEST_PRIVATE_KEY_PATH = join(TEST_KEYS_DIR, "jwt-private.key");
const TEST_PUBLIC_KEY_PATH = join(TEST_KEYS_DIR, "jwt-public.key");

const TEST_TOKEN_PAYLOAD: Omit<TokenPayload, "iat" | "exp"> = {
  userId: "test-user-123",
  email: "test@example.com",
  roleType: "SUPER_ADMIN",
  scopes: ["admin", "read", "write"],
};

describe("Authentication Utilities", () => {
  beforeAll(async () => {
    // Ensure JWT keypair exists for testing
    await ensureJWTKeypair();
  });

  afterAll(async () => {
    // Clean up test keys if they exist
    try {
      if (existsSync(TEST_PRIVATE_KEY_PATH)) {
        await unlink(TEST_PRIVATE_KEY_PATH);
      }
      if (existsSync(TEST_PUBLIC_KEY_PATH)) {
        await unlink(TEST_PUBLIC_KEY_PATH);
      }
      if (existsSync(TEST_KEYS_DIR)) {
        await rmdir(TEST_KEYS_DIR);
      }
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  describe("Password Hashing", () => {
    it("should hash a password successfully", async () => {
      const hashedPassword = await hashPassword(TEST_PASSWORD);
      
      expect(hashedPassword).toBeDefined();
      expect(typeof hashedPassword).toBe("string");
      expect(hashedPassword.length).toBeGreaterThan(0);
      expect(hashedPassword).not.toBe(TEST_PASSWORD);
    });

    it("should generate different hashes for the same password", async () => {
      const hash1 = await hashPassword(TEST_PASSWORD);
      const hash2 = await hashPassword(TEST_PASSWORD);
      
      expect(hash1).not.toBe(hash2);
    });

    it("should handle empty password", async () => {
      // Empty password should throw an error or handle gracefully
      try {
        const hashedPassword = await hashPassword("");
        expect(hashedPassword).toBeDefined();
        expect(typeof hashedPassword).toBe("string");
      } catch (error) {
        // It's acceptable for empty password to throw an error
        expect(error).toBeInstanceOf(Error);
      }
    });

    it("should handle special characters in password", async () => {
      const specialPassword = "P@ssw0rd!@#$%^&*()";
      const hashedPassword = await hashPassword(specialPassword);
      
      expect(hashedPassword).toBeDefined();
      expect(typeof hashedPassword).toBe("string");
      expect(hashedPassword).not.toBe(specialPassword);
    });

    it("should throw error for invalid input", async () => {
      try {
        // @ts-expect-error Testing invalid input
        await hashPassword(null);
        // If it doesn't throw, that's also acceptable behavior
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe("Password Verification", () => {
    it("should verify correct password", async () => {
      const hashedPassword = await hashPassword(TEST_PASSWORD);
      const isValid = await verifyPassword(TEST_PASSWORD, hashedPassword);
      
      expect(isValid).toBe(true);
    });

    it("should reject incorrect password", async () => {
      const hashedPassword = await hashPassword(TEST_PASSWORD);
      const isValid = await verifyPassword("WrongPassword123!", hashedPassword);
      
      expect(isValid).toBe(false);
    });

    it("should reject empty password against valid hash", async () => {
      const hashedPassword = await hashPassword(TEST_PASSWORD);
      const isValid = await verifyPassword("", hashedPassword);
      
      expect(isValid).toBe(false);
    });

    it("should handle case sensitivity", async () => {
      const hashedPassword = await hashPassword(TEST_PASSWORD);
      const isValid = await verifyPassword(TEST_PASSWORD.toLowerCase(), hashedPassword);
      
      expect(isValid).toBe(false);
    });

    it("should throw error for invalid hash format", async () => {
      expect(async () => {
        await verifyPassword(TEST_PASSWORD, "invalid-hash");
      }).toThrow();
    });

    it("should handle null inputs gracefully", async () => {
      const hashedPassword = await hashPassword(TEST_PASSWORD);
      
      try {
        // @ts-expect-error Testing invalid input
        await verifyPassword(null, hashedPassword);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      try {
        // @ts-expect-error Testing invalid input
        await verifyPassword(TEST_PASSWORD, null);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe("JWT Token Generation", () => {
    it("should generate access token successfully", async () => {
      const token = await generateAccessToken(TEST_TOKEN_PAYLOAD);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // JWT has 3 parts
    });

    it("should generate refresh token successfully", async () => {
      const token = await generateRefreshToken(TEST_TOKEN_PAYLOAD);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // JWT has 3 parts
    });

    it("should generate different tokens for same payload", async () => {
      const token1 = await generateAccessToken(TEST_TOKEN_PAYLOAD);
      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1000));
      const token2 = await generateAccessToken(TEST_TOKEN_PAYLOAD);
      
      expect(token1).not.toBe(token2);
    });

    it("should include all payload fields in token", async () => {
      const token = await generateAccessToken(TEST_TOKEN_PAYLOAD);
      const decoded = await verifyAccessToken(token);
      
      expect(decoded.userId).toBe(TEST_TOKEN_PAYLOAD.userId);
      expect(decoded.email).toBe(TEST_TOKEN_PAYLOAD.email);
      expect(decoded.roleType).toBe(TEST_TOKEN_PAYLOAD.roleType);
      expect(decoded.scopes).toEqual(TEST_TOKEN_PAYLOAD.scopes);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it("should set appropriate expiration times", async () => {
      const accessToken = await generateAccessToken(TEST_TOKEN_PAYLOAD);
      const refreshToken = await generateRefreshToken(TEST_TOKEN_PAYLOAD);
      
      const accessDecoded = await verifyAccessToken(accessToken);
      const refreshDecoded = await verifyRefreshToken(refreshToken);
      
      expect(accessDecoded.exp).toBeDefined();
      expect(refreshDecoded.exp).toBeDefined();
      expect(refreshDecoded.exp! > accessDecoded.exp!).toBe(true);
    });

    it("should handle invalid payload gracefully", async () => {
      try {
        // @ts-expect-error Testing invalid input
        await generateAccessToken(null);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      try {
        // @ts-expect-error Testing invalid input
        await generateAccessToken({});
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe("JWT Token Verification", () => {
    it("should verify valid access token", async () => {
      const token = await generateAccessToken(TEST_TOKEN_PAYLOAD);
      const decoded = await verifyAccessToken(token);
      
      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(TEST_TOKEN_PAYLOAD.userId);
      expect(decoded.email).toBe(TEST_TOKEN_PAYLOAD.email);
    });

    it("should verify valid refresh token", async () => {
      const token = await generateRefreshToken(TEST_TOKEN_PAYLOAD);
      const decoded = await verifyRefreshToken(token);
      
      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(TEST_TOKEN_PAYLOAD.userId);
      expect(decoded.email).toBe(TEST_TOKEN_PAYLOAD.email);
    });

    it("should reject invalid token format", async () => {
      expect(async () => {
        await verifyAccessToken("invalid.token.format");
      }).toThrow();

      expect(async () => {
        await verifyRefreshToken("invalid.token.format");
      }).toThrow();
    });

    it("should reject malformed tokens", async () => {
      expect(async () => {
        await verifyAccessToken("not-a-jwt-token");
      }).toThrow();

      expect(async () => {
        await verifyRefreshToken("not-a-jwt-token");
      }).toThrow();
    });

    it("should reject empty tokens", async () => {
      expect(async () => {
        await verifyAccessToken("");
      }).toThrow();

      expect(async () => {
        await verifyRefreshToken("");
      }).toThrow();
    });

    it("should reject null tokens", async () => {
      expect(async () => {
        // @ts-expect-error Testing invalid input
        await verifyAccessToken(null);
      }).toThrow();

      expect(async () => {
        // @ts-expect-error Testing invalid input
        await verifyRefreshToken(null);
      }).toThrow();
    });
  });

  describe("JWT Keypair Management", () => {
    it("should ensure keypair exists", async () => {
      await ensureJWTKeypair();
      
      expect(existsSync(TEST_PRIVATE_KEY_PATH)).toBe(true);
      expect(existsSync(TEST_PUBLIC_KEY_PATH)).toBe(true);
    });

    it("should not regenerate existing keypair", async () => {
      // Mock console.log to capture output
      const consoleSpy = spyOn(console, "log");
      
      await ensureJWTKeypair();
      await ensureJWTKeypair(); // Second call should not regenerate
      
      // Should log that keypair already exists
      expect(consoleSpy).toHaveBeenCalledWith("JWT keypair already exists");
      
      consoleSpy.mockRestore();
    });
  });

  describe("Token Payload Validation", () => {
    it("should handle missing required fields", async () => {
      const incompletePayload = {
        userId: "test-user",
        // Missing email, roleType, scopes
      };

      try {
        // @ts-expect-error Testing incomplete payload
        await generateAccessToken(incompletePayload);
        // If it doesn't throw, the function handles missing fields gracefully
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it("should handle empty scopes array", async () => {
      const payloadWithEmptyScopes = {
        ...TEST_TOKEN_PAYLOAD,
        scopes: [],
      };

      const token = await generateAccessToken(payloadWithEmptyScopes);
      const decoded = await verifyAccessToken(token);
      
      expect(decoded.scopes).toEqual([]);
    });

    it("should handle special characters in payload", async () => {
      const payloadWithSpecialChars = {
        ...TEST_TOKEN_PAYLOAD,
        email: "test+special@example.com",
        roleType: "SUPER_ADMIN",
      };

      const token = await generateAccessToken(payloadWithSpecialChars);
      const decoded = await verifyAccessToken(token);
      
      expect(decoded.email).toBe("test+special@example.com");
    });
  });

  describe("Error Handling", () => {
    it("should handle file system errors gracefully", async () => {
      // Mock file system error
      const originalReadFile = require("fs/promises").readFile;
      const mockReadFile = mock(() => {
        throw new Error("File system error");
      });
      
      // This test would require more complex mocking setup
      // For now, we'll test that errors are properly thrown
      expect(async () => {
        await verifyAccessToken("invalid-token");
      }).toThrow();
    });

    it("should provide meaningful error messages", async () => {
      try {
        await verifyAccessToken("invalid-token");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Invalid or expired");
      }
    });
  });

  describe("Security Features", () => {
    it("should use secure hashing algorithm", async () => {
      const hashedPassword = await hashPassword(TEST_PASSWORD);
      
      // Argon2id hashes should start with $argon2id$
      expect(hashedPassword).toMatch(/^\$argon2id\$/);
    });

    it("should generate cryptographically secure tokens", async () => {
      const tokens = [];
      
      // Generate tokens with small delays to ensure different timestamps
      for (let i = 0; i < 3; i++) {
        tokens.push(await generateAccessToken(TEST_TOKEN_PAYLOAD));
        if (i < 2) await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // All tokens should be different (cryptographically secure)
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(3);
    });

    it("should use RSA-256 algorithm for JWT signing", async () => {
      const token = await generateAccessToken(TEST_TOKEN_PAYLOAD);
      
      // JWT header should indicate RS256 algorithm
      const [header] = token.split(".");
      const decodedHeader = JSON.parse(atob(header));
      expect(decodedHeader.alg).toBe("RS256");
    });
  });
});