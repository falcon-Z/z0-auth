import { Context } from "hono";

export interface DeviceFingerprint {
  userAgent: string;
  acceptLanguage: string;
  ipAddress: string;
  fingerprintHash: string;
}

export interface DeviceInfo {
  type: "desktop" | "mobile" | "tablet" | "unknown";
  os: string;
  browser: string;
  isTrusted?: boolean;
}

/**
 * Generate a device fingerprint from request context
 */
export async function generateFingerprint(c: Context): Promise<DeviceFingerprint> {
  const userAgent = c.req.header("user-agent") || "unknown";
  const acceptLanguage = c.req.header("accept-language") || "unknown";

  // Get IP address (handle various proxy headers)
  const ipAddress =
    c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
    c.req.header("x-real-ip") ||
    c.req.header("cf-connecting-ip") || // Cloudflare
    "unknown";

  // Create fingerprint string
  const fingerprintString = [userAgent, acceptLanguage, ipAddress].join("|");

  // Hash the fingerprint
  const fingerprintHash = await hashString(fingerprintString);

  return {
    userAgent,
    acceptLanguage,
    ipAddress,
    fingerprintHash,
  };
}

/**
 * Parse device information from user agent
 */
export function parseDeviceInfo(userAgent: string): DeviceInfo {
  const ua = userAgent.toLowerCase();

  // Determine device type
  let type: DeviceInfo["type"] = "unknown";
  if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) {
    type = "mobile";
  } else if (/ipad|tablet|playbook|silk/i.test(ua)) {
    type = "tablet";
  } else if (/windows|mac|linux/i.test(ua)) {
    type = "desktop";
  }

  // Determine OS
  let os = "Unknown";
  if (/windows nt 10/i.test(ua)) os = "Windows 10";
  else if (/windows nt 11/i.test(ua)) os = "Windows 11";
  else if (/windows nt 6.3/i.test(ua)) os = "Windows 8.1";
  else if (/windows nt 6.2/i.test(ua)) os = "Windows 8";
  else if (/windows nt 6.1/i.test(ua)) os = "Windows 7";
  else if (/windows/i.test(ua)) os = "Windows";
  else if (/mac os x 10[._](\d+)/i.test(ua)) {
    const match = ua.match(/mac os x 10[._](\d+)/i);
    os = match ? `macOS 10.${match[1]}` : "macOS";
  } else if (/mac/i.test(ua)) os = "macOS";
  else if (/android (\d+)/i.test(ua)) {
    const match = ua.match(/android (\d+)/i);
    os = match ? `Android ${match[1]}` : "Android";
  } else if (/iphone os (\d+)/i.test(ua)) {
    const match = ua.match(/iphone os (\d+)/i);
    os = match ? `iOS ${match[1]}` : "iOS";
  } else if (/ipad.*os (\d+)/i.test(ua)) {
    const match = ua.match(/ipad.*os (\d+)/i);
    os = match ? `iPadOS ${match[1]}` : "iPadOS";
  } else if (/linux/i.test(ua)) os = "Linux";

  // Determine browser
  let browser = "Unknown";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = "Chrome";
  else if (/firefox/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
  else if (/opera|opr\//i.test(ua)) browser = "Opera";
  else if (/msie|trident/i.test(ua)) browser = "Internet Explorer";

  return {
    type,
    os,
    browser,
  };
}

/**
 * Hash a string using SHA-256
 */
async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Get location from IP address (basic implementation)
 * In production, you would use a GeoIP service
 */
export function getLocationFromIP(ipAddress: string): string | undefined {
  // This is a placeholder - in production, use a GeoIP service
  // like MaxMind, ipapi.co, or ip-api.com

  // For localhost/private IPs
  if (
    ipAddress === "unknown" ||
    ipAddress.startsWith("127.") ||
    ipAddress.startsWith("192.168.") ||
    ipAddress.startsWith("10.") ||
    ipAddress.startsWith("172.")
  ) {
    return "Local Network";
  }

  return undefined; // Unknown location
}

/**
 * Compare two fingerprints to see if they match
 */
export function compareFingerprints(
  fp1: DeviceFingerprint,
  fp2: DeviceFingerprint
): boolean {
  return fp1.fingerprintHash === fp2.fingerprintHash;
}

/**
 * Check if device is suspicious based on various factors
 */
export function isSuspiciousDevice(
  deviceInfo: DeviceInfo,
  userAgent: string
): boolean {
  // Check for common bot user agents
  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /headless/i,
    /phantom/i,
    /selenium/i,
    /puppeteer/i,
  ];

  if (botPatterns.some((pattern) => pattern.test(userAgent))) {
    return true;
  }

  // Check for very old browsers (potential security risk)
  const ua = userAgent.toLowerCase();
  if (/msie [6-9]/i.test(ua)) {
    return true; // Old IE versions
  }

  return false;
}
