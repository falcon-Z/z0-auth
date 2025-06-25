import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import ssrPlugin from "vite-ssr-components/plugin";
import path from "path";

export default defineConfig({
  plugins: [cloudflare(), ssrPlugin(), tailwindcss()],
  resolve: {
    alias: {
      "@z0": path.resolve(__dirname, "./src"),
    },
  },
});
