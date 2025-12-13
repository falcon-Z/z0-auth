import { Hono } from "hono";
import platformOrgs from "./organizations";

const platformRoutes = new Hono();

platformRoutes.route("/organizations", platformOrgs);

export default platformRoutes;
