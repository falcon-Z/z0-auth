import { Hono } from "hono";

const V1Routes = new Hono();

V1Routes.get("/", (c) => c.json({ message: "Welcome to V1" }));
V1Routes.get("/books", (c) => c.json({ message: "Get ready to read books" }));

export default V1Routes;
