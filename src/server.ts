import { serve } from "bun";
import app from "./index";
import index from "./index.html";

export const server = serve({
  routes: {
    "/api/*": app.fetch,
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running on http://${server.hostname}:${server.port}`);
