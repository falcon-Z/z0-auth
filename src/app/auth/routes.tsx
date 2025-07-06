import { Hono } from "hono";
import RootUserSetup from "./setup/rootUserSetup";
import { Root } from "@z0/main";

const AuthPageRoutes = new Hono();

AuthPageRoutes.get("setup/register", (c) => c.render(<RootUserSetup />));

export default AuthPageRoutes;
