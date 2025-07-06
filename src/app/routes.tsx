import { Hono } from "hono";
import AuthAppRoutes from "./auth/routes";
import Dashboard from "./dashboard";
import initialSetupMiddleware from "@z0/middlewares/initialSetup";
import InitialAppSetup from "./setup/initialAppSetup";

const AppRoutes = new Hono();

AppRoutes.use(initialSetupMiddleware);

AppRoutes.get("/", (c) => c.render(<Dashboard />));
AppRoutes.get("/setup/register", (c) => c.render(<InitialAppSetup />));
AppRoutes.route("/auth", AuthAppRoutes);

export default AppRoutes;
