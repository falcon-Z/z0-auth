import { Hono } from "hono";
import organizationRoutes from "./organizations";
import platformUserRoutes from "./users";
import platformStatsRoutes from "./stats";
import { requirePlatformManager } from "./middleware";
import { verifyAccessTokenMiddleware } from "@z0/utils/auth";

const platformRoutes = new Hono();

// Apply auth middleware to all platform routes
// requirePlatformManager checks for platformRole presence
platformRoutes.use("*", verifyAccessTokenMiddleware);
platformRoutes.use("*", requirePlatformManager);

platformRoutes.route("/organizations", organizationRoutes);
platformRoutes.route("/users", platformUserRoutes);
platformRoutes.route("/stats", platformStatsRoutes);

export default platformRoutes;
