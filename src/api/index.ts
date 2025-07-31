import { Hono } from "hono";
import V1Routes from "./v1";

const API = new Hono();

//API.route("/setup/", setupAdmin);
API.route("/v1/", V1Routes);

export default API;
