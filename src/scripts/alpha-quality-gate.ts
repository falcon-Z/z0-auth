#!/usr/bin/env bun

const databaseUrl = process.env.DATABASE_URL?.trim();
let databaseName = "";
if (databaseUrl) {
  try {
    databaseName = new URL(databaseUrl.replace(/^postgresql:/, "http:")).pathname.replace(/^\//, "");
  } catch {
    // The configuration error below intentionally avoids echoing a possibly sensitive URL.
  }
}
if (process.env.NODE_ENV !== "test" || !databaseUrl || !databaseName.endsWith("_test")) {
  console.error("Alpha quality gate requires NODE_ENV=test and DATABASE_URL targeting a database ending in _test.");
  process.exit(1);
}

const commonTestArgs = ["--preload", "./tests/preload.ts", "--max-concurrency=1", "--parallel=1"];
const phases: Array<{ label: string; command: string[] }> = [
  {
    label: "OpenAPI contracts and migration integrity",
    command: ["bun", "test", ...commonTestArgs, "tests/unit/openapi-contracts.test.ts", "tests/integration/migration-integrity.test.ts"],
  },
  {
    label: "Alpha smoke journeys",
    command: [
      "bun", "test", ...commonTestArgs,
      "tests/api/health.test.ts",
      "tests/unit/instance-keys-config.test.ts",
      "tests/integration/setup-flow.test.ts",
      "tests/integration/app-auth-flow.test.ts",
      "tests/integration/oauth-flow.test.ts",
      "tests/integration/smtp-email-flow.test.ts",
      "tests/integration/rbac-flow.test.ts",
    ],
  },
  {
    label: "Full unit, integration, and API regression suite",
    command: ["bun", "test", ...commonTestArgs, "tests/unit", "tests/integration", "tests/api"],
  },
  { label: "Production build", command: ["bun", "run", "build"] },
];

for (const phase of phases) {
  console.log(`\n==> ${phase.label}`);
  const child = Bun.spawn(phase.command, { cwd: process.cwd(), env: process.env, stdout: "inherit", stderr: "inherit", stdin: "inherit" });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    console.error(`Alpha quality gate failed during: ${phase.label}`);
    process.exit(exitCode);
  }
}

console.log("\nAlpha quality gate passed.");
