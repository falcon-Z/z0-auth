import { Hono } from "hono";
import V1Routes from "./v1";
import setupAdmin from "./setup";
import AuthRoutes from "./auth";
import HealthRoutes from "./health";
import AdminKeyRoutes from "./admin/keys";

const API = new Hono();

API.route("/setup/", setupAdmin);
API.route("/auth/", AuthRoutes);
API.route("/v1/", V1Routes);
API.route("/health/", HealthRoutes);
API.route("/admin/keys/", AdminKeyRoutes);

export default API;
