/** Accept only the browser's exact serialized HTTP(S) origin, without URL repair. */
export function isSerializedHttpOrigin(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || value.includes("*")) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.origin === value &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Browser registrations require HTTPS except for explicit loopback development. */
export function isRegistrableBrowserOrigin(value: unknown): value is string {
  if (!isSerializedHttpOrigin(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}
