import { Hono } from "hono";
import organizationRoutes from "./organizations";
import platformUserRoutes from "./users";
import { requirePlatformManager } from "./middleware";
import { verifyAccessTokenMiddleware } from "@z0/utils/auth";

const platformRoutes = new Hono();

// Parent router already checks verifyAccessTokenMiddleware
// But likely only broadly. We should ensure it checks PlatformManager scope?
// The parent ../index.ts mount likely applies middleware?
// Checking ../index.ts... actually let's re-verify middleware application.

platformRoutes.use("*", verifyAccessTokenMiddleware);
platformRoutes.use("*", requirePlatformManager);

platformRoutes.route("/organizations", organizationRoutes);
platformRoutes.route("/users", platformUserRoutes);

export default platformRoutes;
