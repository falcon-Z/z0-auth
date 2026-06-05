function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** Allow only same-origin relative paths for post-login redirects. */
export function safeReturnPath(value: string | undefined | null, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return fallback;
  }

  if (hasControlChars(decoded)) return fallback;
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
  if (decoded.includes("://") || decoded.includes("\\")) return fallback;
  return decoded;
}
