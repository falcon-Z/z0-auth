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
import Login from "./components/auth/login";
import Auth from "./pages/auth";
import Dashboard from "./pages/dashboard";
import ApiRoutes from "./api/routes";
import PageRoutes from "./pages/routes";

const app = new Hono();

// Environment-specific configuration
const isDevelopment = process.env.NODE_ENV === "development";
const isProduction = process.env.NODE_ENV === "production";

// Security middlewares
app.use(
  cors({
    origin: (origin) => {
      // In development, allow all origins for easier testing
      if (isDevelopment) {
        return true;
      }
      
      // In production, use environment variables or database configuration
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || ["https://localhost:3000"];
      return allowedOrigins.includes(origin);
    },
    credentials: true, // Allow credentials for SSO
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Request-ID"],
  })
);

app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", isDevelopment ? "'unsafe-eval'" : ""],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", isDevelopment ? "ws://localhost:*" : ""],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
    crossOriginEmbedderPolicy: false, // Disable for development compatibility
    strictTransportSecurity: isProduction ? "max-age=31536000; includeSubDomains" : false,
  })
);

app.use(
  bodyLimit({
    maxSize: 50 * 1024 * 1024, // 50MB limit
    onError: (c) => {
      return c.json({ error: "Request body too large", maxSize: "50MB" }, 413);
    },
  })
);

// Logging and monitoring middlewares
app.use(logger());
app.use(timing());
app.use(requestId());

// Performance middlewares
app.use(compress());
app.use(etag());

// Error handling middlewares
app.use(prettyJSON());
app.use(
  timeout(parseInt(process.env.REQUEST_TIMEOUT || "30000"), (c) => {
    return c.json({ error: "Request timeout", timeout: "30s" }, 504);
  })
);

// Application-specific middlewares
app.use(renderer);

// Routes
app.route("/", PageRoutes);
app.route("api", ApiRoutes);

export default app;
