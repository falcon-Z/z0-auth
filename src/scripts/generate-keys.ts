#!/usr/bin/env bun
/**
 * Generate all production instance keys for one z0-auth environment.
 * Run once per environment; store the output in your secret manager.
 */
const today = new Date().toISOString().slice(0, 10);

const dataBytes = crypto.getRandomValues(new Uint8Array(32));
const dataKeyHex = [...dataBytes].map((b) => b.toString(16).padStart(2, "0")).join("");

const tokenPair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
  "sign",
  "verify",
])) as CryptoKeyPair;
const tokenPrivate = new Uint8Array(await crypto.subtle.exportKey("pkcs8", tokenPair.privateKey));
const tokenPublic = new Uint8Array(await crypto.subtle.exportKey("spki", tokenPair.publicKey));

console.log("Add these to your secret store (same values on every pod):\n");
console.log(`INSTANCE_DATA_KEY_ID=data-${today}`);
console.log(`INSTANCE_DATA_KEY=${dataKeyHex}`);
console.log(`INSTANCE_TOKEN_KEY_ID=token-${today}`);
console.log(`INSTANCE_TOKEN_PRIVATE_KEY=${Buffer.from(tokenPrivate).toString("base64")}`);
console.log(`INSTANCE_TOKEN_PUBLIC_KEY=${Buffer.from(tokenPublic).toString("base64")}`);
