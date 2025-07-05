import { Hono } from "hono";
import RootUserAPI from "./users";

const RootRoutes = new Hono();

RootRoutes.route("/user", RootUserAPI);

export default RootRoutes;
