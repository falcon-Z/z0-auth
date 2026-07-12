import { applySecurityHeaders } from "./security-headers";

type ConsoleAssets = {
  document: Blob;
  files: ReadonlyMap<string, Blob>;
};

function consoleResponse(body: BodyInit | null, contentType: string, cacheControl: string): Response {
  return applySecurityHeaders(new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    },
  }));
}

export function createConsoleAssetHandler(assets: ConsoleAssets): (request: Request) => Response {
  return (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return applySecurityHeaders(new Response(null, {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      }));
    }

    const pathname = new URL(request.url).pathname;
    const asset = assets.files.get(pathname);
    if (asset) {
      return consoleResponse(
        request.method === "HEAD" ? null : asset,
        asset.type || "application/octet-stream",
        "public, max-age=31536000, immutable",
      );
    }

    if (pathname.includes(".")) {
      return applySecurityHeaders(new Response(null, { status: 404 }));
    }

    return consoleResponse(
      request.method === "HEAD" ? null : assets.document,
      "text/html; charset=utf-8",
      "no-store",
    );
  };
}

export async function loadBuiltConsoleHandler(buildDirectory: string): Promise<(request: Request) => Response> {
  const document = Bun.file(`${buildDirectory}/index.html`);
  if (!(await document.exists())) {
    throw new Error("Built console assets are missing. Run `bun run build` before starting production.");
  }

  const files = new Map<string, Blob>();
  const chunks = new Bun.Glob("chunk-*");
  for await (const relativePath of chunks.scan({ cwd: buildDirectory, onlyFiles: true })) {
    files.set(`/${relativePath}`, Bun.file(`${buildDirectory}/${relativePath}`));
  }
  return createConsoleAssetHandler({ document, files });
}

export async function buildConsoleHandler(sourceDocument: string): Promise<(request: Request) => Response> {
  const { default: tailwindPlugin } = await import("bun-plugin-tailwind");
  const result = await Bun.build({
    entrypoints: [sourceDocument],
    target: "browser",
    write: false,
    publicPath: "/",
    plugins: [tailwindPlugin],
  });
  if (!result.success) {
    throw new AggregateError(result.logs, "Unable to build console assets");
  }

  const document = result.outputs.find((output) => output.type.startsWith("text/html"));
  if (!document) throw new Error("Console build did not produce an HTML document");
  const files = new Map<string, Blob>();
  for (const output of result.outputs) {
    if (output === document) continue;
    files.set(`/${output.path.split("/").at(-1)}`, output);
  }
  return createConsoleAssetHandler({ document, files });
}

export async function loadConsoleHandler(serverDirectory: string): Promise<(request: Request) => Response> {
  if (serverDirectory.split(/[\\/]/).at(-1) === "dist") {
    return loadBuiltConsoleHandler(serverDirectory);
  }

  const sourceDocument = `${serverDirectory}/app/console/index.html`;
  if (await Bun.file(sourceDocument).exists()) return buildConsoleHandler(sourceDocument);
  throw new Error("Console source and built assets are both missing");
}
