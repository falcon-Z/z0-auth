import tailwindPlugin from "bun-plugin-tailwind";

const result = await Bun.build({
  entrypoints: ["./src/server.ts"],
  outdir: "dist",
  target: "bun",
  minify: true,
  plugins: [tailwindPlugin],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
