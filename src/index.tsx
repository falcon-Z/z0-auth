import { Hono } from "hono";
import { renderer } from "./renderer";
import Login from "./components/auth/login";
import Auth from "./pages/auth";
import Dashboard from "./pages/dashboard";
import ApiRoutes from "./api/routes";
import PageRoutes from "./pages/routes";

const app = new Hono();

app.use(renderer);

app.route("/", PageRoutes);
app.route("api", ApiRoutes);

export default app;
