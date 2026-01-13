/**
 * Webhook Signature Utilities
 * HMAC-SHA256 signing for webhook payloads
 */

import { createHmac, randomBytes } from "crypto";

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
export function generateSignature(payload: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(payload, "utf8");
  return hmac.digest("hex");
}

/**
 * Verify HMAC-SHA256 signature
 */
export function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = generateSignature(payload, secret);
  if (signature.length !== expected.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Generate a random webhook secret
 */
export function generateWebhookSecret(): string {
  const random = randomBytes(32).toString("base64").replace(/\+/g, "0").replace(/\//g, "1").replace(/=/g, "");
  return `whsec_${random}`;
}

/**
 * Build signature header value
 */
export function buildSignatureHeader(timestamp: number, signature: string): string {
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Parse signature header value
 */
export function parseSignatureHeader(header: string): { timestamp: number; signature: string } | null {
  const parts = header.split(",");
  let timestamp: number | null = null;
  let signature: string | null = null;

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") {
      timestamp = parseInt(value, 10);
    } else if (key === "v1") {
      signature = value;
    }
  }

  if (timestamp === null || signature === null) {
    return null;
  }

  return { timestamp, signature };
}
