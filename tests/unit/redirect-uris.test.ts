import { describe, expect, test } from "bun:test";

import { validateRedirectUris } from "../../src/api/lib/redirect-uris";

describe("validateRedirectUris", () => {
  test("accepts localhost http in development", () => {
    const result = validateRedirectUris(["http://localhost:3000/callback"], "development");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.uris).toEqual(["http://localhost:3000/callback"]);
  });

  test("rejects invalid URL", () => {
    const result = validateRedirectUris(["not-a-url"], "development");
    expect(result.ok).toBe(false);
  });

  test("requires https in production for non-local hosts", () => {
    const result = validateRedirectUris(["http://app.example.com/cb"], "production");
    expect(result.ok).toBe(false);
  });

  test("dedupes identical URIs", () => {
    const uri = "https://app.example.com/cb";
    const result = validateRedirectUris([uri, uri], "production");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.uris).toEqual([uri]);
  });
});
