import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import { compress } from "hono/compress";
import { etag } from "hono/etag";
import { requestId } from "hono/request-id";
import { timeout } from "hono/timeout";
import { bodyLimit } from "hono/body-limit";
import { renderer } from "./renderer";
import ApiRoutes from "./api/routes";
import PageRoutes from "./pages/routes";
import { HTTPException } from "hono/http-exception";

const app = new Hono();

const isDevelopment = process.env.NODE_ENV === "development";
const isProduction = process.env.NODE_ENV === "production";

app.use(
  cors({
    origin: (origin) => {
      if (isDevelopment) {
        return origin;
      }

      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
        "https://localhost:3000",
      ];
      return allowedOrigins.includes(origin) ? origin : null;
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-Request-ID",
    ],
  })
);

app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        isDevelopment ? "'unsafe-eval'" : "",
      ],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", isDevelopment ? "ws://localhost:*" : ""],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
    crossOriginEmbedderPolicy: false, // Disable for development compatibility
    strictTransportSecurity: isProduction
      ? "max-age=31536000; includeSubDomains"
      : false,
  })
);

app.use(
  bodyLimit({
    maxSize: 50 * 1024 * 1024,
    onError: (c) => {
      return c.json({ error: "Request body too large", maxSize: "50MB" }, 413);
    },
  })
);

app.use(requestId());
app.use(timing());
app.use(logger());

if (isProduction) {
  app.use(
    compress({
      encoding: "gzip",
    })
  );
}
app.use(etag());

app.use(prettyJSON());

app.use(
  timeout(parseInt(process.env.REQUEST_TIMEOUT || "30000"), (c) => {
    throw new HTTPException(504, {
      res: c.json({ error: "Request timeout", timeout: "30s" }, 504),
    });
  })
);

app.use(renderer);

app.route("/", PageRoutes);
app.route("api", ApiRoutes);

app.notFound((c) => {
  return c.json(
    {
      error: "Bad Request",
      message:
        "The requested resource was not found or the request is invalid.",
    },
    400
  );
});

export default app;
