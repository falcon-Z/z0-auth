import { Hono } from "hono";
import AuthPageRoutes from "./auth/routes";
import Dashboard from "./dashboard";
import initialSetupMiddleware from "@z0/middlewares/initialSetup";

const PageRoutes = new Hono();

PageRoutes.use(initialSetupMiddleware);

PageRoutes.get("/", (c) => c.render(<Dashboard />));
PageRoutes.route("/auth", AuthPageRoutes);

export default PageRoutes;
