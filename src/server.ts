import { serve } from "bun";
import app from "./index";
import index from "./index.html";
import { postStartupChecks } from "./utils/server";

const port = parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.BIND_HOST || "0.0.0.0";

export const server = serve({
  port,
  hostname,
  routes: {
    "/api/*": app.fetch,
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

postStartupChecks();
