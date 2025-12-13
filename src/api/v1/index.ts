import { Hono } from "hono";

import platformRoutes from "./platform";
import orgRoutes from "./orgs";

const V1Routes = new Hono();

V1Routes.route("/platform", platformRoutes);
V1Routes.route("/orgs", orgRoutes);
V1Routes.get("/", (c) => c.json({ message: "Welcome to V1" }));
V1Routes.get("/books", (c) => c.json({ message: "Get ready to read books" }));

export default V1Routes;
