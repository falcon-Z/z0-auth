import { describe, expect, test } from "bun:test";

import { createConsoleAssetHandler } from "../../src/api/lib/console-assets";

const handler = createConsoleAssetHandler({
  document: new Blob(["<!doctype html><title>Console</title>"], { type: "text/html" }),
  files: new Map([
    ["/chunk-app.js", new Blob(["console.log('console')"], { type: "text/javascript" })],
  ]),
});

describe("production console assets", () => {
  test("serves the SPA document with response-level security headers", async () => {
    const response = handler(new Request("https://auth.example.com/settings"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(await response.text()).toContain("Console");
  });

  test("serves only built assets with immutable caching", async () => {
    const response = handler(new Request("https://auth.example.com/chunk-app.js"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toContain("console.log");

    expect(handler(new Request("https://auth.example.com/missing.js")).status).toBe(404);
  });

  test("supports HEAD and rejects unsupported methods", async () => {
    const head = handler(new Request("https://auth.example.com/", { method: "HEAD" }));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");

    const post = handler(new Request("https://auth.example.com/", { method: "POST" }));
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");
    expect(post.headers.get("content-security-policy")).toBeTruthy();
  });
});
