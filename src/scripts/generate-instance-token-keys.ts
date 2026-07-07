#!/usr/bin/env bun
/**
 * Generate Ed25519 keys for password-reset link signatures.
 * Run once per environment; store in your secret manager — same values on every replica.
 */
const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
  "sign",
  "verify",
])) as CryptoKeyPair;

const priv = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
const pub = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
const privB64 = Buffer.from(priv).toString("base64");
const pubB64 = Buffer.from(pub).toString("base64");
const kid = `token-${new Date().toISOString().slice(0, 10)}`;

console.log("Add both to your secret store (same values on every pod):\n");
console.log(`INSTANCE_TOKEN_KEY_ID=${kid}`);
console.log(`INSTANCE_TOKEN_PRIVATE_KEY=${privB64}`);
console.log(`INSTANCE_TOKEN_PUBLIC_KEY=${pubB64}`);
