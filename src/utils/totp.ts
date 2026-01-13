/**
 * TOTP (Time-based One-Time Password) Implementation
 * RFC 6238: https://datatracker.ietf.org/doc/html/rfc6238
 * Using Web Crypto API for HMAC-SHA1
 * No external dependencies
 */

const TOTP_WINDOW = 30; // 30 seconds
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = "SHA-1";

/**
 * Base32 encoding/decoding (without padding for simplicity)
 */
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input: string): Uint8Array {
  input = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  let index = 0;
  const output = new Uint8Array(Math.ceil((input.length * 5) / 8));

  for (let i = 0; i < input.length; i++) {
    const charIndex = BASE32_CHARS.indexOf(input[i]);
    if (charIndex === -1) continue;

    value = (value << 5) | charIndex;
    bits += 5;

    if (bits >= 8) {
      output[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }

  return output.slice(0, index);
}

/**
 * Generate a random secret (20 bytes = 160 bits)
 */
export function generateSecret(): string {
  const buffer = new Uint8Array(20);
  crypto.getRandomValues(buffer);
  return base32Encode(buffer);
}

/**
 * Generate HOTP (HMAC-based One-Time Password)
 * RFC 4226: https://datatracker.ietf.org/doc/html/rfc4226
 */
async function generateHOTP(
  secret: string,
  counter: number,
  digits: number = TOTP_DIGITS
): Promise<string> {
  // Decode base32 secret
  const key = base32Decode(secret);

  // Counter as 8-byte big-endian
  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  counterView.setBigUint64(0, BigInt(counter), false);

  // Import key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: TOTP_ALGORITHM },
    false,
    ["sign"]
  );

  // Generate HMAC
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    counterBuffer
  );

  const hmac = new Uint8Array(signature);

  // Dynamic truncation (RFC 4226 Section 5.3)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, "0");
}

/**
 * Generate TOTP (Time-based One-Time Password)
 */
export async function generateTOTP(
  secret: string,
  time: number = Date.now(),
  window: number = TOTP_WINDOW
): Promise<string> {
  const counter = Math.floor(time / 1000 / window);
  return generateHOTP(secret, counter, TOTP_DIGITS);
}

/**
 * Verify TOTP with time window tolerance
 * @param secret Base32 encoded secret
 * @param token User provided token
 * @param window Time window in seconds (default 30)
 * @param tolerance Number of windows to check before/after (default 1)
 */
export async function verifyTOTP(
  secret: string,
  token: string,
  window: number = TOTP_WINDOW,
  tolerance: number = 1
): Promise<boolean> {
  const now = Date.now();
  const currentCounter = Math.floor(now / 1000 / window);

  // Check current window and +/- tolerance windows
  for (let i = -tolerance; i <= tolerance; i++) {
    const counter = currentCounter + i;
    const expectedToken = await generateHOTP(secret, counter, TOTP_DIGITS);

    if (expectedToken === token) {
      return true;
    }
  }

  return false;
}

/**
 * Generate QR code data URI for authenticator apps
 * Format: otpauth://totp/{label}?secret={secret}&issuer={issuer}
 */
export function generateQRCodeData(
  secret: string,
  email: string,
  issuer: string = "Z0-Auth"
): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedSecret = encodeURIComponent(secret);

  return `otpauth://totp/${label}?secret=${encodedSecret}&issuer=${encodedIssuer}&algorithm=${TOTP_ALGORITHM}&digits=${TOTP_DIGITS}&period=${TOTP_WINDOW}`;
}

/**
 * Generate backup codes (8 characters each, base32)
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];

  for (let i = 0; i < count; i++) {
    const buffer = new Uint8Array(5); // 5 bytes = 8 base32 chars
    crypto.getRandomValues(buffer);
    const code = base32Encode(buffer);
    // Format as XXXX-XXXX
    codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
  }

  return codes;
}

/**
 * Hash backup code for storage (using Web Crypto SHA-256)
 */
export async function hashBackupCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify backup code against hash
 */
export async function verifyBackupCode(
  code: string,
  hash: string
): Promise<boolean> {
  const computedHash = await hashBackupCode(code);
  return computedHash === hash;
}
