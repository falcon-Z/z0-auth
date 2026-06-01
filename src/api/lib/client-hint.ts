/** Parse a short device label from User-Agent (e.g. "Chrome on Windows"). */
export function parseClientLabel(userAgent: string): string {
  const ua = userAgent.trim();
  if (!ua) return "Unknown device";

  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  return `${browser} on ${os}`;
}

/** Mask IPv4 for display; IPv6 and unknown collapse safely. */
export function maskIpForDisplay(ip: string): string | null {
  const trimmed = ip.trim();
  if (!trimmed || trimmed === "unknown" || trimmed === "local") return null;

  if (trimmed.includes(".")) {
    const parts = trimmed.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
  }

  if (trimmed.includes(":")) return "IPv6";

  return null;
}

function detectBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  return "Browser";
}

function detectOs(ua: string): string {
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown OS";
}
