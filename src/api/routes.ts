import { Hono } from "hono";
import V1Routes from "./v1/routes";

const ApiRoutes = new Hono();

ApiRoutes.route("v1", V1Routes);

export default ApiRoutes;
