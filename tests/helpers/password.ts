function randomSegment(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function makeStrongPassword(): string {
  // Keep all character classes required by policy.
  return `Aa1!${randomSegment()}${randomSegment()}`;
}
