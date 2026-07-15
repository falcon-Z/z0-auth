import tailwindPlugin from "bun-plugin-tailwind";
import { mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });

for await (const relativePath of new Bun.Glob("chunk-*").scan({ cwd: "dist", onlyFiles: true })) {
  await Bun.file(`dist/${relativePath}`).delete();
}
for (const path of ["dist/index.html", "dist/app/console/index.html"]) {
  const file = Bun.file(path);
  if (await file.exists()) await file.delete();
}

const consoleResult = await Bun.build({
  entrypoints: ["./src/app/console/index.html"],
  outdir: "dist",
  target: "browser",
  minify: true,
  publicPath: "/",
  plugins: [tailwindPlugin],
});

const serverResult = await Bun.build({
  entrypoints: ["./src/server.ts"],
  outdir: "dist",
  target: "bun",
  minify: true,
  plugins: [tailwindPlugin],
});

if (!consoleResult.success || !serverResult.success) {
  for (const log of [...consoleResult.logs, ...serverResult.logs]) console.error(log);
  process.exit(1);
}
