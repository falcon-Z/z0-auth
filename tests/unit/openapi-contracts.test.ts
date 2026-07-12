import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";

type ApiDocument = {
  openapi?: unknown;
  info?: unknown;
  paths?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
};

const referencesDir = path.join(import.meta.dir, "..", "..", "docs", "api", "references");
const operationMethods = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

async function loadDocuments(): Promise<Map<string, ApiDocument>> {
  const files = (await readdir(referencesDir)).filter((file) => file.endsWith(".openapi.yaml")).sort();
  const documents = new Map<string, ApiDocument>();
  for (const file of files) {
    const content = await Bun.file(path.join(referencesDir, file)).text();
    documents.set(file, Bun.YAML.parse(content) as ApiDocument);
  }
  return documents;
}

function decodePointerSegment(segment: string): string {
  return decodeURIComponent(segment).replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolvePointer(document: unknown, pointer: string, source: string): unknown {
  if (!pointer || pointer === "#") return document;
  if (!pointer.startsWith("#/")) throw new Error(`${source}: unsupported $ref pointer ${pointer}`);
  let current: unknown = document;
  for (const rawSegment of pointer.slice(2).split("/")) {
    const segment = decodePointerSegment(rawSegment);
    if (!current || typeof current !== "object" || !(segment in current)) {
      throw new Error(`${source}: missing $ref segment ${segment} in ${pointer}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function visitReferences(value: unknown, sourceFile: string, documents: Map<string, ApiDocument>): void {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value) && typeof (value as { $ref?: unknown }).$ref === "string") {
    const reference = (value as { $ref: string }).$ref;
    if (!reference.startsWith("#") && !reference.startsWith("http://") && !reference.startsWith("https://")) {
      const [file, fragment = ""] = reference.split("#", 2);
      const target = documents.get(file!);
      if (!target) throw new Error(`${sourceFile}: missing local $ref file ${file}`);
      resolvePointer(target, fragment ? `#${fragment}` : "#", `${sourceFile} -> ${reference}`);
    } else if (reference.startsWith("#")) {
      resolvePointer(documents.get(sourceFile), reference, `${sourceFile} -> ${reference}`);
    }
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    visitReferences(child, sourceFile, documents);
  }
}

describe("OpenAPI release contracts", () => {
  test("all specifications parse and local references resolve", async () => {
    const documents = await loadDocuments();
    expect(documents.size).toBeGreaterThan(0);
    for (const [file, document] of documents) {
      expect(document.openapi, file).toBe("3.1.0");
      expect(document.info, file).toBeTruthy();
      if (file !== "common.openapi.yaml") expect(document.paths, file).toBeTruthy();
      visitReferences(document, file, documents);
    }
  });

  test("operation IDs are unique across the published API", async () => {
    const documents = await loadDocuments();
    const seen = new Map<string, string>();
    for (const [file, document] of documents) {
      for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
        for (const [method, operation] of Object.entries(pathItem)) {
          if (!operationMethods.has(method) || !operation || typeof operation !== "object") continue;
          const operationId = (operation as { operationId?: unknown }).operationId;
          expect(typeof operationId, `${method.toUpperCase()} ${route} in ${file}`).toBe("string");
          const prior = seen.get(operationId as string);
          expect(prior, `duplicate operationId ${operationId} in ${file} and ${prior}`).toBeUndefined();
          seen.set(operationId as string, file);
        }
      }
    }
  });

  test("alpha-critical endpoint groups remain specified", async () => {
    const documents = await loadDocuments();
    const paths = new Set([...documents.values()].flatMap((document) => Object.keys(document.paths ?? {})));
    const required = [
      "/api/health",
      "/api/ready",
      "/api/setup",
      "/api/auth/login",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
      "/api/v1/apps",
      "/api/v1/apps/{appId}/users",
      "/api/v1/rbac/roles",
      "/api/v1/settings/email/test",
      "/oauth/authorize",
      "/oauth/token",
      "/.well-known/openid-configuration",
      "/.well-known/jwks.json",
      "/oauth/userinfo",
    ];
    for (const route of required) expect(paths.has(route), route).toBe(true);
  });
});
