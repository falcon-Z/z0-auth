import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("ui contract documentation", () => {
  test("ui-flows.md documents required redirects", () => {
    const docPath = path.join(import.meta.dir, "../../docs/api/ui-flows.md");
    const content = readFileSync(docPath, "utf8");
    expect(content).toContain("/setup");
    expect(content).toContain("/login");
    expect(content).toContain("/setup/complete");
    expect(content).toContain("503");
    expect(content).toContain("SetupRequired");
  });
});
