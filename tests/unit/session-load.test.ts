import { afterEach, describe, expect, test } from "bun:test";

import { loadSession } from "../../src/app/console/lib/api";
import { mockFetch } from "../helpers/fetch";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("console session loading", () => {
  test("returns an authenticated session with a valid user", async () => {
    const user = { id: "operator-id", name: "Operator", email: "operator@example.com" };
    globalThis.fetch = mockFetch(async () => Response.json({ authenticated: true, user }));
    expect(await loadSession()).toEqual({ kind: "authenticated", session: { authenticated: true, user } });
  });

  test("requires a usable user in authenticated responses", async () => {
    for (const user of [undefined, null, {}, { id: "operator-id", name: "Operator" }, { id: 123, name: "Operator", email: "operator@example.com" }]) {
      globalThis.fetch = mockFetch(async () => Response.json({ authenticated: true, user }));
      expect(await loadSession()).toEqual({ kind: "unavailable" });
    }
  });

  test("returns login for an unauthenticated response", async () => {
    globalThis.fetch = mockFetch(async () => Response.json({ authenticated: false }));
    expect(await loadSession()).toEqual({ kind: "login" });
  });

  test("reports network and malformed JSON failures as unavailable", async () => {
    globalThis.fetch = mockFetch(async () => { throw new Error("network unavailable"); });
    expect(await loadSession()).toEqual({ kind: "unavailable" });
    globalThis.fetch = mockFetch(async () => new Response("invalid JSON"));
    expect(await loadSession()).toEqual({ kind: "unavailable" });
  });
});
