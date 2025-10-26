import { Hono } from "hono";
import handleSetup from "./handlers";
import { createRateLimit, rateLimitConfigs } from "@z0/utils/rate-limiter";

const setupAdmin = new Hono();

// Apply strict rate limiting to setup endpoint
const setupRateLimit = createRateLimit(rateLimitConfigs.strict);

setupAdmin.post("/", setupRateLimit, handleSetup);

export default setupAdmin;
