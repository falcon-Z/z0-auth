import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { closeDatabase, getDb } from "../../src/api/lib/db";
import { hashPassword } from "../../src/api/lib/password";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const ownerPassword = makeStrongPassword();
const memberPassword = makeStrongPassword();

function sessionCookieFromResponse(res: Response): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const match = raw?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function inviteTokenFromUrl(url: string): string {
  return new URL(url).pathname.split("/").pop() ?? "";
}

async function completeSetup() {
  const csrf = await fetchCsrfToken(dispatchApi);
  await dispatchApi(
    buildRequest("POST", "/api/setup", {
      csrfToken: csrf,
      body: {
        name: "Owner User",
        email: "owner@example.com",
        password: ownerPassword,
        passwordConfirm: ownerPassword,
        organizationName: "Acme Corp",
      },
    }),
  );
}

async function login(email: string, password: string) {
  const csrf = await fetchCsrfToken(dispatchApi);
  const res = await dispatchApi(
    buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email, password },
    }),
  );
  return { res, cookie: sessionCookieFromResponse(res) };
}

run("M02 instance owner journey", () => {
  let memberCookie = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();

    const owner = await login("owner@example.com", ownerPassword);
    const csrf = await fetchCsrfToken(dispatchApi);
    const createRes = await dispatchApi(
      buildRequest("POST", "/api/v1/members/invites", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: owner.cookie! },
        body: { email: "member@example.com", invitedName: "Second Member" },
      }),
    );
    expect(createRes.status).toBe(201);
    const { inviteUrl } = (await createRes.json()) as { inviteUrl: string };
    const token = inviteTokenFromUrl(inviteUrl);

    const acceptCsrf = await fetchCsrfToken(dispatchApi);
    const acceptRes = await dispatchApi(
      buildRequest("POST", `/api/v1/invites/${token}/accept`, {
        csrfToken: acceptCsrf,
        body: {
          name: "Second Member",
          password: memberPassword,
          passwordConfirm: memberPassword,
        },
      }),
    );
    expect(acceptRes.status).toBe(200);
    memberCookie = sessionCookieFromResponse(acceptRes)!;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("owner and invited member can load console summary", async () => {
    const owner = await login("owner@example.com", ownerPassword);
    for (const cookie of [owner.cookie!, memberCookie]) {
      const res = await dispatchApi(
        buildRequest("GET", "/api/v1/console/summary", {
          cookies: { [SESSION_COOKIE]: cookie },
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { instance: { memberCount: number } };
      expect(body.instance.memberCount).toBeGreaterThanOrEqual(2);
    }
  });

  test("signed-in user without instance membership cannot use members API", async () => {
    const outsiderPassword = makeStrongPassword();
    const hash = await hashPassword(outsiderPassword);
    await getDb().begin(async (tx) => {
      const [user] = await tx`
        INSERT INTO users (email, name, email_verified_at)
        VALUES ('outsider@example.com', 'Outsider', NOW())
        RETURNING id
      `;
      await tx`
        INSERT INTO password_credentials (user_id, password_hash)
        VALUES (${String((user as { id: string }).id)}, ${hash})
      `;
    });

    const { cookie } = await login("outsider@example.com", outsiderPassword);
    const sessionRes = await dispatchApi(
      buildRequest("GET", "/api/auth/session", {
        cookies: { [SESSION_COOKIE]: cookie! },
      }),
    );
    const session = (await sessionRes.json()) as { authenticated: boolean; isInstanceMember?: boolean };
    expect(session.authenticated).toBe(true);
    expect(session.isInstanceMember).toBe(false);

    const membersRes = await dispatchApi(
      buildRequest("GET", "/api/v1/members", {
        cookies: { [SESSION_COOKIE]: cookie! },
      }),
    );
    expect(membersRes.status).toBe(403);
  });
});
