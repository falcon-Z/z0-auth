import { describe, expect, test } from "bun:test";

import { createProblemDetail } from "@z0/contracts/errors";

describe("createProblemDetail", () => {
  test("includes required problem fields and requestId", () => {
    const body = createProblemDetail(400, "Validation Error", "Invalid request", {
      errors: [{ field: "email", code: "invalid_email", message: "Invalid email address" }],
    });
    expect(body.type).toBe("about:blank");
    expect(body.title).toBe("Validation Error");
    expect(body.status).toBe(400);
    expect(body.detail).toBe("Invalid request");
    expect(body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(body.errors).toHaveLength(1);
  });
});
