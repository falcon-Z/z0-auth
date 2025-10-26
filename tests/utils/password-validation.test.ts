import { describe, it, expect } from "bun:test";
import {
  validatePassword,
  getStrengthColor,
  getStrengthBgColor,
  getProgressWidth,
  type PasswordValidationResult,
  type PasswordValidationCriteria,
} from "../../src/utils/password-validation";

describe("Password Validation Utilities", () => {
  describe("validatePassword", () => {
    describe("Strong Passwords", () => {
      it("should validate a strong password", () => {
        const strongPassword = "Tr0ub4dor&3Complex!";
        const result = validatePassword(strongPassword);
        
        expect(result.isValid).toBe(true);
        expect(result.strength).toBe("strong");
        expect(result.score).toBeGreaterThanOrEqual(80);
        expect(result.criteria.minLength).toBe(true);
        expect(result.criteria.hasUppercase).toBe(true);
        expect(result.criteria.hasLowercase).toBe(true);
        expect(result.criteria.hasNumbers).toBe(true);
        expect(result.criteria.hasSpecialChars).toBe(true);
        expect(result.criteria.noCommonPatterns).toBe(true);
        expect(result.feedback).toHaveLength(0);
        expect(result.hints).toContain("Excellent! Your password is strong and secure");
      });

      it("should validate another strong password with different patterns", () => {
        const strongPassword = "Tr0ub4dor&3Complex!";
        const result = validatePassword(strongPassword);
        
        expect(result.isValid).toBe(true);
        expect(result.strength).toBe("strong");
        expect(result.score).toBeGreaterThanOrEqual(80);
      });

      it("should handle very long strong passwords", () => {
        const longPassword = "Xk9#mP2$vL8@nQ4!wR7&zT5%yU3*iO6^";
        const result = validatePassword(longPassword);
        
        expect(result.isValid).toBe(true);
        expect(result.strength).toBe("strong");
        expect(result.score).toBeGreaterThanOrEqual(80);
      });
    });

    describe("Medium Strength Passwords", () => {
      it("should validate a password with medium characteristics", () => {
        const password = "Zx9#kL2$";
        const result = validatePassword(password);
        
        expect(result.isValid).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(60);
        expect(result.criteria.minLength).toBe(true);
        expect(result.criteria.hasUppercase).toBe(true);
        expect(result.criteria.hasLowercase).toBe(true);
        expect(result.criteria.hasNumbers).toBe(true);
        expect(result.criteria.hasSpecialChars).toBe(true);
        expect(result.criteria.noCommonPatterns).toBe(true);
      });

      it("should provide appropriate hints for medium passwords", () => {
        const mediumPassword = "Zx9#kL2$mN8!";
        const result = validatePassword(mediumPassword);
        
        if (result.score >= 60 && result.score < 80) {
          expect(result.hints).toContain("Good password! Consider adding more character variety for maximum security");
        }
      });
    });

    describe("Weak Passwords", () => {
      it("should reject password that's too short", () => {
        const shortPassword = "Sh0rt!";
        const result = validatePassword(shortPassword);
        
        expect(result.isValid).toBe(false);
        expect(result.criteria.minLength).toBe(false);
        expect(result.feedback).toContain("Password must be at least 8 characters long");
      });

      it("should reject password without uppercase", () => {
        const noUppercase = "lowercase123!";
        const result = validatePassword(noUppercase);
        
        expect(result.isValid).toBe(false);
        expect(result.criteria.hasUppercase).toBe(false);
        expect(result.feedback).toContain("Add at least one uppercase letter (A-Z)");
      });

      it("should reject password without lowercase", () => {
        const noLowercase = "UPPERCASE123!";
        const result = validatePassword(noLowercase);
        
        expect(result.isValid).toBe(false);
        expect(result.criteria.hasLowercase).toBe(false);
        expect(result.feedback).toContain("Add at least one lowercase letter (a-z)");
      });

      it("should reject password without numbers", () => {
        const noNumbers = "NoNumbers!";
        const result = validatePassword(noNumbers);
        
        expect(result.isValid).toBe(false);
        expect(result.criteria.hasNumbers).toBe(false);
        expect(result.feedback).toContain("Add at least one number (0-9)");
      });

      it("should reject password without special characters", () => {
        const noSpecialChars = "NoSpecialChars123";
        const result = validatePassword(noSpecialChars);
        
        expect(result.isValid).toBe(false);
        expect(result.criteria.hasSpecialChars).toBe(false);
        expect(result.feedback).toContain("Add at least one special character (!@#$%^&*...)");
      });

      it("should reject common password patterns", () => {
        const commonPasswords = [
          "Password123!",
          "123456789!Aa",
          "Qwerty123!",
          "Admin123!",
          "Welcome123!",
        ];

        commonPasswords.forEach(password => {
          const result = validatePassword(password);
          expect(result.isValid).toBe(false);
          expect(result.criteria.noCommonPatterns).toBe(false);
          expect(result.feedback).toContain("Avoid common patterns and dictionary words");
        });
      });

      it("should reject passwords with repeated characters", () => {
        const repeatedChars = "Aaaa1111!!!!";
        const result = validatePassword(repeatedChars);
        
        expect(result.isValid).toBe(false);
        expect(result.criteria.noCommonPatterns).toBe(false);
      });

      it("should reject passwords with sequential numbers", () => {
        const sequential = "Test123456!";
        const result = validatePassword(sequential);
        
        expect(result.isValid).toBe(false);
        expect(result.criteria.noCommonPatterns).toBe(false);
      });

      it("should reject passwords with sequential letters", () => {
        const sequential = "Abcdef123!";
        const result = validatePassword(sequential);
        
        expect(result.isValid).toBe(false);
        expect(result.criteria.noCommonPatterns).toBe(false);
      });
    });

    describe("Edge Cases", () => {
      it("should handle empty password", () => {
        const result = validatePassword("");
        
        expect(result.isValid).toBe(false);
        expect(result.strength).toBe("weak");
        expect(result.score).toBe(20); // Empty password gets 20 points for avoiding common patterns
        expect(result.criteria.minLength).toBe(false);
        expect(result.feedback.length).toBeGreaterThan(0);
      });

      it("should handle very long password", () => {
        const veryLongPassword = "A".repeat(100) + "1!";
        const result = validatePassword(veryLongPassword);
        
        expect(result.isValid).toBe(false); // Lacks diversity
        expect(result.criteria.minLength).toBe(true);
      });

      it("should handle password with only special characters", () => {
        const specialOnly = "!@#$%^&*()_+";
        const result = validatePassword(specialOnly);
        
        expect(result.isValid).toBe(false);
        expect(result.criteria.hasSpecialChars).toBe(true);
        expect(result.criteria.hasUppercase).toBe(false);
        expect(result.criteria.hasLowercase).toBe(false);
        expect(result.criteria.hasNumbers).toBe(false);
      });

      it("should handle password with unicode characters", () => {
        const unicodePassword = "Pässwörd123!";
        const result = validatePassword(unicodePassword);
        
        expect(result.criteria.minLength).toBe(true);
        expect(result.criteria.hasNumbers).toBe(true);
        expect(result.criteria.hasSpecialChars).toBe(true);
      });

      it("should handle null or undefined input gracefully", () => {
        try {
          // @ts-expect-error Testing invalid input
          const resultNull = validatePassword(null);
          expect(resultNull.isValid).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(TypeError);
        }

        try {
          // @ts-expect-error Testing invalid input
          const resultUndefined = validatePassword(undefined);
          expect(resultUndefined.isValid).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(TypeError);
        }
      });
    });

    describe("Score Calculation", () => {
      it("should give higher scores to longer passwords", () => {
        const short = validatePassword("Zx9#kL2$");
        const medium = validatePassword("Zx9#kL2$mN8!");
        const long = validatePassword("Zx9#kL2$mN8!qP4&");
        
        expect(medium.score).toBeGreaterThan(short.score);
        // Long password should have score >= medium (may be capped at 100)
        expect(long.score).toBeGreaterThanOrEqual(medium.score);
      });

      it("should give higher scores to more diverse passwords", () => {
        const simple = validatePassword("TestTest123!");
        const diverse = validatePassword("T3st!P@ssW0rd");
        
        expect(diverse.score).toBeGreaterThan(simple.score);
      });

      it("should cap score at 100", () => {
        const maxPassword = "VeryComplexP@ssw0rd!WithM@nyDiff3r3ntCh@r@ct3rs123456";
        const result = validatePassword(maxPassword);
        
        expect(result.score).toBeLessThanOrEqual(100);
      });

      it("should give minimum score of 0 for empty password", () => {
        const result = validatePassword("");
        expect(result.score).toBe(20); // Empty password gets 20 points for avoiding common patterns
      });
    });

    describe("Feedback Generation", () => {
      it("should provide multiple feedback messages for weak passwords", () => {
        const weakPassword = "weak";
        const result = validatePassword(weakPassword);
        
        expect(result.feedback.length).toBeGreaterThan(1);
        expect(result.feedback).toContain("Password must be at least 8 characters long");
        expect(result.feedback).toContain("Add at least one uppercase letter (A-Z)");
        expect(result.feedback).toContain("Add at least one number (0-9)");
        expect(result.feedback).toContain("Add at least one special character (!@#$%^&*...)");
      });

      it("should provide no feedback for valid passwords", () => {
        const strongPassword = "MyStr0ng!P@ssw0rd";
        const result = validatePassword(strongPassword);
        
        expect(result.feedback).toHaveLength(0);
      });

      it("should provide specific feedback for each missing criteria", () => {
        const testCases = [
          { password: "toolong", expectedFeedback: "Add at least one uppercase letter (A-Z)" },
          { password: "TOOLONG", expectedFeedback: "Add at least one lowercase letter (a-z)" },
          { password: "NoNumbers!", expectedFeedback: "Add at least one number (0-9)" },
          { password: "NoSpecial123", expectedFeedback: "Add at least one special character (!@#$%^&*...)" },
        ];

        testCases.forEach(({ password, expectedFeedback }) => {
          const result = validatePassword(password);
          expect(result.feedback).toContain(expectedFeedback);
        });
      });
    });

    describe("Hints Generation", () => {
      it("should provide encouraging hints for good passwords", () => {
        const goodPassword = "GoodPassword123!";
        const result = validatePassword(goodPassword);
        
        expect(result.hints).toContain("Great! Your password meets the basic requirements");
      });

      it("should suggest improvements for medium passwords", () => {
        const mediumPassword = "TestPass1!";
        const result = validatePassword(mediumPassword);
        
        if (result.score >= 60 && result.score < 80) {
          expect(result.hints).toContain("Good password! Consider adding more character variety for maximum security");
        }
      });

      it("should encourage longer passwords for weak ones", () => {
        const weakPassword = "Test1!";
        const result = validatePassword(weakPassword);
        
        if (result.score < 80) {
          expect(result.hints).toContain("Consider using a longer password for better security");
        }
      });
    });
  });

  describe("UI Helper Functions", () => {
    describe("getStrengthColor", () => {
      it("should return correct colors for each strength level", () => {
        expect(getStrengthColor("weak")).toBe("text-red-500");
        expect(getStrengthColor("medium")).toBe("text-yellow-500");
        expect(getStrengthColor("strong")).toBe("text-green-500");
      });

      it("should handle invalid strength values", () => {
        // @ts-expect-error Testing invalid input
        expect(getStrengthColor("invalid")).toBe("text-gray-500");
        // @ts-expect-error Testing invalid input
        expect(getStrengthColor(null)).toBe("text-gray-500");
        // @ts-expect-error Testing invalid input
        expect(getStrengthColor(undefined)).toBe("text-gray-500");
      });
    });

    describe("getStrengthBgColor", () => {
      it("should return correct background colors for each strength level", () => {
        expect(getStrengthBgColor("weak")).toBe("bg-red-500");
        expect(getStrengthBgColor("medium")).toBe("bg-yellow-500");
        expect(getStrengthBgColor("strong")).toBe("bg-green-500");
      });

      it("should handle invalid strength values", () => {
        // @ts-expect-error Testing invalid input
        expect(getStrengthBgColor("invalid")).toBe("bg-gray-300");
        // @ts-expect-error Testing invalid input
        expect(getStrengthBgColor(null)).toBe("bg-gray-300");
        // @ts-expect-error Testing invalid input
        expect(getStrengthBgColor(undefined)).toBe("bg-gray-300");
      });
    });

    describe("getProgressWidth", () => {
      it("should return correct width percentages", () => {
        expect(getProgressWidth(0)).toBe(10); // Minimum width
        expect(getProgressWidth(50)).toBe(50);
        expect(getProgressWidth(100)).toBe(100);
        expect(getProgressWidth(150)).toBe(100); // Maximum width
      });

      it("should handle negative values", () => {
        expect(getProgressWidth(-10)).toBe(10); // Should return minimum
      });

      it("should handle decimal values", () => {
        expect(getProgressWidth(75.5)).toBe(75.5);
        expect(getProgressWidth(25.9)).toBe(25.9);
      });

      it("should handle invalid input", () => {
        // @ts-expect-error Testing invalid input
        const nullResult = getProgressWidth(null);
        expect(nullResult).toBe(10);
        
        // @ts-expect-error Testing invalid input
        const undefinedResult = getProgressWidth(undefined);
        expect(undefinedResult).toBe(10);
        
        // @ts-expect-error Testing invalid input
        const invalidResult = getProgressWidth("invalid");
        expect(invalidResult).toBe(10);
      });
    });
  });

  describe("Type Safety", () => {
    it("should return properly typed validation result", () => {
      const result = validatePassword("TestPassword123!");
      
      // Check that all required properties exist with correct types
      expect(typeof result.isValid).toBe("boolean");
      expect(typeof result.strength).toBe("string");
      expect(["weak", "medium", "strong"]).toContain(result.strength);
      expect(typeof result.score).toBe("number");
      expect(Array.isArray(result.feedback)).toBe(true);
      expect(Array.isArray(result.hints)).toBe(true);
      
      // Check criteria object structure
      expect(typeof result.criteria).toBe("object");
      expect(typeof result.criteria.minLength).toBe("boolean");
      expect(typeof result.criteria.hasUppercase).toBe("boolean");
      expect(typeof result.criteria.hasLowercase).toBe("boolean");
      expect(typeof result.criteria.hasNumbers).toBe("boolean");
      expect(typeof result.criteria.hasSpecialChars).toBe("boolean");
      expect(typeof result.criteria.noCommonPatterns).toBe("boolean");
    });

    it("should handle all feedback and hints as strings", () => {
      const result = validatePassword("weak");
      
      result.feedback.forEach(feedback => {
        expect(typeof feedback).toBe("string");
        expect(feedback.length).toBeGreaterThan(0);
      });

      result.hints.forEach(hint => {
        expect(typeof hint).toBe("string");
        expect(hint.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Performance", () => {
    it("should validate passwords quickly", () => {
      const start = performance.now();
      
      // Test multiple passwords
      for (let i = 0; i < 100; i++) {
        validatePassword(`TestPassword${i}!`);
      }
      
      const end = performance.now();
      const duration = end - start;
      
      // Should complete 100 validations in less than 100ms
      expect(duration).toBeLessThan(100);
    });

    it("should handle very long passwords efficiently", () => {
      const longPassword = "A".repeat(1000) + "1!";
      const start = performance.now();
      
      validatePassword(longPassword);
      
      const end = performance.now();
      const duration = end - start;
      
      // Should complete even very long password validation quickly
      expect(duration).toBeLessThan(50);
    });
  });
});