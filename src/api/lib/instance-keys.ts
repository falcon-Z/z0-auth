import { mkdir } from "node:fs/promises";
import path from "node:path";

const KEYS_VERSION = 2;
const DATA_ALGO = "AES-GCM";
const DATA_IV_BYTES = 12;

type StoredKeysFile = {
  version: number;
  /** Present when data key is file-backed (dev or shared volume). Omitted when using INSTANCE_DATA_KEY. */
  dataKey?: string;
  dataKeyId?: string;
  tokenPrivateKey: string;
  tokenPublicKey: string;
  tokenKeyId?: string;
};

type LoadedKeys = {
  dataKey: CryptoKey;
  dataKeyId: string;
  dataKeys: Map<string, CryptoKey>;
  tokenPrivateKey: CryptoKey;
  tokenPublicKey: CryptoKey;
  tokenKeyId: string;
  tokenPublicKeys: Map<string, CryptoKey>;
};

export type InstanceKeySources = {
  dataKey: "env" | "file" | "generated" | "missing";
  tokenKeys: "env" | "file" | "generated" | "missing";
  dataKeyId?: string;
  tokenKeyId?: string;
  keysFilePath: string;
};

let loaded: LoadedKeys | null = null;
let sources: InstanceKeySources | null = null;

function keysFilePath(): string {
  const configured = process.env.INSTANCE_KEYS_PATH?.trim();
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), ".data/instance-keys.json");
}

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlEncodeText(text: string): string {
  return base64UrlEncode(new TextEncoder().encode(text));
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  return new Uint8Array(Buffer.from(padded + "=".repeat(pad), "base64"));
}

function base64UrlDecodeText(value: string): string {
  return new TextDecoder().decode(base64UrlDecode(value));
}

function configuredKeyId(envName: string, fallback: string): string {
  const configured = process.env[envName]?.trim();
  if (!configured) {
    if (isProduction()) throw new Error(`${envName} is required in production.`);
    return fallback;
  }
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(configured)) {
    throw new Error(`${envName} must use 3–64 letters, numbers, underscores, or hyphens.`);
  }
  return configured;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Parse a 32-byte AES key from hex (64 chars) or base64. */
export function parseDataKeyMaterial(raw: string): Uint8Array | null {
  const trimmed = raw.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = Number.parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    return bytes;
  }
  try {
    const decoded = base64ToBytes(trimmed);
    if (decoded.length === 32) return decoded;
  } catch {
    /* ignore */
  }
  return null;
}

async function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: DATA_ALGO, length: 256 }, true, ["encrypt", "decrypt"]);
}

async function generateTokenKeyPair(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }> {
  return crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as Promise<{
    privateKey: CryptoKey;
    publicKey: CryptoKey;
  }>;
}

async function importDataKeyBytes(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.length !== 32) throw new Error("Data encryption key must be exactly 32 bytes.");
  return crypto.subtle.importKey("raw", raw, { name: DATA_ALGO, length: 256 }, false, ["encrypt", "decrypt"]);
}

async function importDataKeyB64(b64: string): Promise<CryptoKey> {
  return importDataKeyBytes(base64ToBytes(b64));
}

async function exportDataKeyRaw(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bytesToBase64(new Uint8Array(raw));
}

async function exportTokenPrivateKey(key: CryptoKey): Promise<string> {
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", key);
  return bytesToBase64(new Uint8Array(pkcs8));
}

async function exportTokenPublicKey(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey("spki", key);
  return bytesToBase64(new Uint8Array(spki));
}

async function importTokenPrivateKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", base64ToBytes(b64), { name: "Ed25519" }, false, ["sign"]);
}

async function importTokenPublicKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", base64ToBytes(b64), { name: "Ed25519" }, false, ["verify"]);
}

async function writeKeysFile(filePath: string, stored: StoredKeysFile): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await Bun.write(filePath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
}

async function readKeysFile(filePath: string): Promise<StoredKeysFile | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  const parsed = JSON.parse(await file.text()) as StoredKeysFile;
  if (parsed.version !== KEYS_VERSION && parsed.version !== 1) {
    throw new Error(`Unsupported instance keys file version: ${parsed.version}`);
  }
  return parsed;
}

async function tokenKeysFromEnv(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey } | null> {
  const priv = process.env.INSTANCE_TOKEN_PRIVATE_KEY?.trim();
  const pub = process.env.INSTANCE_TOKEN_PUBLIC_KEY?.trim();
  if (!priv && !pub) return null;
  if (!priv || !pub) {
    throw new Error("Set both INSTANCE_TOKEN_PRIVATE_KEY and INSTANCE_TOKEN_PUBLIC_KEY, or neither.");
  }
  return {
    privateKey: await importTokenPrivateKey(priv),
    publicKey: await importTokenPublicKey(pub),
  };
}

async function resolveDataKey(
  filePath: string,
  stored: StoredKeysFile | null,
): Promise<{ key: CryptoKey | null; kid?: string; source: InstanceKeySources["dataKey"] }> {
  const envKey = process.env.INSTANCE_DATA_KEY?.trim();
  if (envKey) {
    const bytes = parseDataKeyMaterial(envKey);
    if (!bytes) {
      throw new Error("INSTANCE_DATA_KEY must be 32 bytes as 64-char hex or base64.");
    }
    return {
      key: await importDataKeyBytes(bytes),
      kid: configuredKeyId("INSTANCE_DATA_KEY_ID", "env-data-key"),
      source: "env",
    };
  }

  if (isProduction()) {
    return { key: null, source: "missing" };
  }

  if (stored?.dataKey) {
    return { key: await importDataKeyB64(stored.dataKey), kid: stored.dataKeyId ?? "file-data-key", source: "file" };
  }

  const key = await generateDataKey();
  return { key, kid: "dev-generated-data-key", source: "generated" };
}

async function resolveTokenKeys(
  filePath: string,
  stored: StoredKeysFile | null,
): Promise<{
  keys: { privateKey: CryptoKey; publicKey: CryptoKey } | null;
  kid?: string;
  source: InstanceKeySources["tokenKeys"];
  exported: { tokenPrivateKey: string; tokenPublicKey: string };
}> {
  const fromEnv = await tokenKeysFromEnv();
  if (fromEnv) {
    return {
      keys: fromEnv,
      kid: configuredKeyId("INSTANCE_TOKEN_KEY_ID", "env-token-key"),
      source: "env",
      exported: {
        tokenPrivateKey: process.env.INSTANCE_TOKEN_PRIVATE_KEY!.trim(),
        tokenPublicKey: process.env.INSTANCE_TOKEN_PUBLIC_KEY!.trim(),
      },
    };
  }

  if (isProduction()) {
    return {
      keys: null,
      source: "missing",
      exported: { tokenPrivateKey: "", tokenPublicKey: "" },
    };
  }

  if (stored?.tokenPrivateKey && stored?.tokenPublicKey) {
    return {
      keys: {
        privateKey: await importTokenPrivateKey(stored.tokenPrivateKey),
        publicKey: await importTokenPublicKey(stored.tokenPublicKey),
      },
      kid: stored.tokenKeyId ?? "file-token-key",
      source: "file",
      exported: {
        tokenPrivateKey: stored.tokenPrivateKey,
        tokenPublicKey: stored.tokenPublicKey,
      },
    };
  }

  const generated = await generateTokenKeyPair();
  return {
    keys: generated,
    kid: "dev-generated-token-key",
    source: "generated",
    exported: {
      tokenPrivateKey: await exportTokenPrivateKey(generated.privateKey),
      tokenPublicKey: await exportTokenPublicKey(generated.publicKey),
    },
  };
}

async function persistIfNeeded(
  filePath: string,
  stored: StoredKeysFile | null,
  data: { key: CryptoKey | null; kid?: string; source: InstanceKeySources["dataKey"] },
  token: {
    kid?: string;
    source: InstanceKeySources["tokenKeys"];
    exported: { tokenPrivateKey: string; tokenPublicKey: string };
  },
): Promise<void> {
  const shouldWriteData = data.source === "generated" && data.key;
  const shouldWriteToken = token.source === "generated";

  if (!shouldWriteData && !shouldWriteToken) return;

  const nextStored: StoredKeysFile = {
    ...stored,
    version: KEYS_VERSION,
    tokenPrivateKey: shouldWriteToken ? token.exported.tokenPrivateKey : stored?.tokenPrivateKey ?? token.exported.tokenPrivateKey,
    tokenPublicKey: shouldWriteToken ? token.exported.tokenPublicKey : stored?.tokenPublicKey ?? token.exported.tokenPublicKey,
  };

  if (shouldWriteData && data.key) {
    nextStored.dataKey = await exportDataKeyRaw(data.key);
    nextStored.dataKeyId = data.kid ?? "dev-generated-data-key";
  } else if (stored?.dataKey && data.kid) {
    nextStored.dataKeyId = data.kid;
  }

  if (shouldWriteToken) {
    nextStored.tokenKeyId = token.kid ?? "dev-generated-token-key";
  }

  await writeKeysFile(filePath, nextStored);
}

/** Load or create instance keys before handling secrets or signed tokens. */
export async function initializeInstanceKeys(): Promise<void> {
  if (loaded) return;

  const filePath = keysFilePath();
  const stored = await readKeysFile(filePath);

  const data = await resolveDataKey(filePath, stored);
  const token = await resolveTokenKeys(filePath, stored);

  sources = {
    dataKey: data.source,
    tokenKeys: token.source,
    ...(data.kid ? { dataKeyId: data.kid } : {}),
    ...(token.kid ? { tokenKeyId: token.kid } : {}),
    keysFilePath: filePath,
  };

  if (!data.key || !token.keys) {
    loaded = null;
    if (isProduction()) {
      throw new Error(
        "Production instance keys are not configured. Set INSTANCE_DATA_KEY, INSTANCE_TOKEN_PRIVATE_KEY, and INSTANCE_TOKEN_PUBLIC_KEY.",
      );
    }
    return;
  }

  const probe = crypto.getRandomValues(new Uint8Array(32));
  const signature = await crypto.subtle.sign("Ed25519", token.keys.privateKey, probe);
  const pairMatches = await crypto.subtle.verify("Ed25519", token.keys.publicKey, signature, probe);
  if (!pairMatches) throw new Error("INSTANCE_TOKEN_PRIVATE_KEY and INSTANCE_TOKEN_PUBLIC_KEY do not match.");

  await persistIfNeeded(filePath, stored, data, token);

  loaded = {
    dataKey: data.key,
    dataKeyId: data.kid ?? "active-data-key",
    dataKeys: new Map([[data.kid ?? "active-data-key", data.key]]),
    tokenPrivateKey: token.keys.privateKey,
    tokenPublicKey: token.keys.publicKey,
    tokenKeyId: token.kid ?? "active-token-key",
    tokenPublicKeys: new Map([[token.kid ?? "active-token-key", token.keys.publicKey]]),
  };
}

/** True when data and token keys are loaded (required for SMTP encryption and reset links). */
export function areInstanceKeysReady(): boolean {
  if (!loaded || !sources) return false;
  return sources.dataKey !== "missing" && sources.tokenKeys !== "missing";
}

export function getInstanceKeySources(): InstanceKeySources | null {
  return sources;
}

export function requireInstanceKeys(): LoadedKeys {
  if (!loaded) {
    throw new Error("Instance keys are not initialized. Call initializeInstanceKeys() at server startup.");
  }
  return loaded;
}

/** AES-GCM encrypt instance secrets (SMTP password, etc.). */
export async function encryptWithDataKey(plaintext: string): Promise<string> {
  const { dataKey, dataKeyId } = requireInstanceKeys();
  const iv = crypto.getRandomValues(new Uint8Array(DATA_IV_BYTES));
  const cipher = await crypto.subtle.encrypt(
    { name: DATA_ALGO, iv },
    dataKey,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.length);
  return `z0enc:v1:${base64UrlEncodeText(dataKeyId)}:${base64UrlEncode(combined)}`;
}

/** AES-GCM decrypt instance secrets. */
export async function decryptWithDataKey(ciphertextB64: string): Promise<string> {
  const keys = requireInstanceKeys();
  const parts = ciphertextB64.split(":");
  if (parts.length !== 4 || parts[0] !== "z0enc" || parts[1] !== "v1") {
    throw new Error("Unsupported encrypted secret format.");
  }

  const kid = base64UrlDecodeText(parts[2]!);
  const dataKey = keys.dataKeys.get(kid);
  if (!dataKey) {
    throw new Error(`Data key ${kid} is not available for decryption.`);
  }
  const combined = base64UrlDecode(parts[3]!);
  const iv = combined.subarray(0, DATA_IV_BYTES);
  const data = combined.subarray(DATA_IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: DATA_ALGO, iv }, dataKey, data);
  return new TextDecoder().decode(plain);
}

export type SignedResetPayload = {
  v: 1;
  uid: string;
  exp: number;
  jti: string;
  /** `app` when resetting an app user password; omitted for console users. */
  realm?: "app";
  /** Application id when `realm` is `app`. */
  aid?: string;
};

/** Sign a password-reset token (Ed25519). Returns URL-safe token string. */
export async function signResetToken(payload: SignedResetPayload): Promise<string> {
  const { tokenPrivateKey, tokenKeyId } = requireInstanceKeys();
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign("Ed25519", tokenPrivateKey, body);
  return `z0rt.v1.${base64UrlEncodeText(tokenKeyId)}.${base64UrlEncode(body)}.${base64UrlEncode(
    new Uint8Array(signature),
  )}`;
}

/** Verify reset token signature and parse payload. */
export async function verifyResetToken(
  token: string,
): Promise<{ ok: true; payload: SignedResetPayload } | { ok: false }> {
  const keys = requireInstanceKeys();
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "z0rt" || parts[1] !== "v1") {
    return { ok: false };
  }

  try {
    const kid = base64UrlDecodeText(parts[2]!);
    const tokenPublicKey = keys.tokenPublicKeys.get(kid);
    if (!tokenPublicKey) return { ok: false };
    const bodyPart = parts[3]!;
    const signaturePart = parts[4]!;
    const body = base64UrlDecode(bodyPart);
    const signature = base64UrlDecode(signaturePart);
    const valid = await crypto.subtle.verify("Ed25519", tokenPublicKey, signature, body);
    if (!valid) return { ok: false };

    const payload = JSON.parse(new TextDecoder().decode(body)) as SignedResetPayload;
    if (payload.v !== 1 || !payload.uid || !payload.jti || typeof payload.exp !== "number") {
      return { ok: false };
    }
    if (payload.realm === "app" && !payload.aid) {
      return { ok: false };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false };
  }
}

/** Reset in-memory keys (tests only). */
export function resetInstanceKeysForTests(): void {
  loaded = null;
  sources = null;
}
