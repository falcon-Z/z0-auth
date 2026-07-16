const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(input: string): Uint8Array {
  const normalized = input.toUpperCase().replace(/[\s=-]/g, "");
  if (!normalized || [...normalized].some((char) => !BASE32_ALPHABET.includes(char))) {
    throw new Error("Invalid Base32 value");
  }
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of normalized) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

export function generateTotpSecret(): string {
  return encodeBase32(crypto.getRandomValues(new Uint8Array(20)));
}

function counterBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(8);
  let remaining = BigInt(counter);
  for (let index = 7; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

export async function generateTotpCode(secret: string, timestampMs = Date.now()): Promise<string> {
  const secretBytes = Uint8Array.from(decodeBase32(secret));
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes.buffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const counter = Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
  const counterBuffer = Uint8Array.from(counterBytes(counter)).buffer;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBuffer));
  const offset = signature[signature.length - 1]! & 0x0f;
  const binary =
    ((signature[offset]! & 0x7f) << 24) |
    ((signature[offset + 1]! & 0xff) << 16) |
    ((signature[offset + 2]! & 0xff) << 8) |
    (signature[offset + 3]! & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function normalizeTotpCode(input: string): string | null {
  const normalized = input.replace(/\s/g, "");
  return /^\d{6}$/.test(normalized) ? normalized : null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function verifyTotpCode(
  secret: string,
  input: string,
  timestampMs = Date.now(),
): Promise<boolean> {
  return (await matchingTotpStep(secret, input, timestampMs)) !== null;
}

export async function matchingTotpStep(
  secret: string,
  input: string,
  timestampMs = Date.now(),
): Promise<number | null> {
  const normalized = normalizeTotpCode(input);
  if (!normalized) return null;
  const currentStep = Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
  for (const offset of [-1, 0, 1]) {
    const expected = await generateTotpCode(secret, timestampMs + offset * TOTP_PERIOD_SECONDS * 1000);
    if (constantTimeEqual(normalized, expected)) return currentStep + offset;
  }
  return null;
}

export function provisioningUri(input: { secret: string; issuer: string; account: string }): string {
  const label = `${input.issuer}:${input.account}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function generateRecoveryCode(): string {
  const raw = encodeBase32(crypto.getRandomValues(new Uint8Array(16)));
  return raw.match(/.{1,4}/g)!.join("-");
}

export function normalizeRecoveryCode(input: string): string | null {
  const normalized = input.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z2-7]{26}$/.test(normalized) ? normalized : null;
}
