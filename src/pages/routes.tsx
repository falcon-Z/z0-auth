import { Hono } from "hono";
import Dashboard from "./dashboard";
import Auth from "./auth";

const PageRoutes = new Hono();

PageRoutes.get("/", (c) => c.render(<Dashboard />));
PageRoutes.get("/auth", (c) => c.render(<Auth />));

export default PageRoutes;
