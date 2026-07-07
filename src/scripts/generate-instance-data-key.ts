#!/usr/bin/env bun
/**
 * Generate a stable AES-256 data key for INSTANCE_DATA_KEY (Kubernetes Secret, etc.).
 * Run once per environment; store the output — do not regenerate unless rotating secrets.
 */
const bytes = crypto.getRandomValues(new Uint8Array(32));
const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const b64 = Buffer.from(bytes).toString("base64");
const kid = `data-${new Date().toISOString().slice(0, 10)}`;

console.log("Add to your secret store (same value on every pod):\n");
console.log(`INSTANCE_DATA_KEY_ID=${kid}`);
console.log(`INSTANCE_DATA_KEY=${hex}`);
console.log("\nOr base64 form:\n");
console.log(`INSTANCE_DATA_KEY=${b64}`);
