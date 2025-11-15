import { Hono } from "hono";
import V1Routes from "./v1";
import setupAdmin from "./setup";
import AuthRoutes from "./auth";

const API = new Hono();

API.route("/setup/", setupAdmin);
API.route("/auth/", AuthRoutes);
API.route("/v1/", V1Routes);

export default API;
