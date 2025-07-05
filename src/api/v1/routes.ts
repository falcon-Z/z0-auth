import { Hono } from "hono";
import RootRoutes from "./root/routes";

const V1Routes = new Hono();

V1Routes.route("/root", RootRoutes);

export default V1Routes;
