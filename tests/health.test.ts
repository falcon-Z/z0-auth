import { describe, expect, it } from "bun:test";
import app from "../src/index";

describe("Health Endpoints", () => {
  it("should return ok for liveness probe", async () => {
    const res = await app.request("/api/health/live");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.uptime).toBeDefined();
  });

  it("should return ready for readiness probe (db connected)", async () => {
    const res = await app.request("/api/health/ready");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
  });

  it("should return metrics", async () => {
    const res = await app.request("/api/health/metrics");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.memory).toBeDefined();
    expect(body.system).toBeDefined();
  });
});
