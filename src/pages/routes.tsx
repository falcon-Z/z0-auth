import { Hono } from "hono";
import Dashboard from "./dashboard";
import Auth from "./auth";
import AuthPageRoutes from "./auth/routes";

const PageRoutes = new Hono();

PageRoutes.get("/", (c) => c.render(<Dashboard />));
PageRoutes.route("/auth", AuthPageRoutes);

export default PageRoutes;
