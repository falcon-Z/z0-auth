import { Hono } from "hono";
import AuthPageRoutes from "./auth/routes";
import Dashboard from "./dashboard";

const PageRoutes = new Hono();

PageRoutes.get("/", (c) => c.render(<Dashboard />));
PageRoutes.route("/auth", AuthPageRoutes);

export default PageRoutes;
