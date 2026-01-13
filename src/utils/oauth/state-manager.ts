/**
 * OAuth State Manager
 * Handles state parameter generation and validation for CSRF protection
 */

import { OAuthProvider, OAuthState } from "./types";
import { Logger } from "../error-handling";
import crypto from "crypto";

export class OAuthStateManager {
  private static readonly STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
  private static readonly SECRET = process.env.JWT_SECRET || "oauth-state-secret";

  /**
   * Generate state parameter for OAuth flow
   */
  static generateState(
    provider: OAuthProvider,
    organizationId: string,
    returnUrl?: string
  ): string {
    const stateData: OAuthState = {
      provider,
      organizationId,
      returnUrl,
      nonce: crypto.randomBytes(16).toString("hex"),
      timestamp: Date.now(),
    };

    // Encode state as base64 JSON
    const stateJson = JSON.stringify(stateData);
    const stateBase64 = Buffer.from(stateJson).toString("base64url");

    // Sign the state to prevent tampering
    const signature = this.signState(stateBase64);

    return `${stateBase64}.${signature}`;
  }

  /**
   * Validate and decode state parameter
   */
  static validateState(state: string): OAuthState | null {
    try {
      const [stateBase64, signature] = state.split(".");

      if (!stateBase64 || !signature) {
        Logger.warn("Invalid state format - missing parts");
        return null;
      }

      // Verify signature
      const expectedSignature = this.signState(stateBase64);
      if (signature !== expectedSignature) {
        Logger.warn("Invalid state signature");
        return null;
      }

      // Decode state
      const stateJson = Buffer.from(stateBase64, "base64url").toString("utf-8");
      const stateData: OAuthState = JSON.parse(stateJson);

      // Check expiry
      const age = Date.now() - stateData.timestamp;
      if (age > this.STATE_EXPIRY_MS) {
        Logger.warn("State expired", { age });
        return null;
      }

      return stateData;
    } catch (error: any) {
      Logger.error("Error validating OAuth state", {
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Sign state data using HMAC
   */
  private static signState(data: string): string {
    return crypto
      .createHmac("sha256", this.SECRET)
      .update(data)
      .digest("base64url");
  }
}
