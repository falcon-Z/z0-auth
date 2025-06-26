import { Hono } from "hono";

const V1Routes = new Hono();

V1Routes.get("/", (c) => c.text("Hello V1"));

export default V1Routes;
