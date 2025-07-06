import { Hono } from "hono";
import AuthAppRoutes from "./auth/routes";
import Dashboard from "./dashboard";
import initialSetupMiddleware from "@z0/middlewares/initialSetup";
import { Root } from "@z0/main";

const AppRoutes = new Hono();

AppRoutes.use(initialSetupMiddleware);

AppRoutes.get("/", (c) => c.render(<Dashboard />));
AppRoutes.route("/auth", AuthAppRoutes);

export default AppRoutes;
