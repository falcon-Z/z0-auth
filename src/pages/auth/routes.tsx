import { Hono } from "hono";
import RootUserSetup from "./setup/rootUserSetup";

const AuthPageRoutes = new Hono();

AuthPageRoutes.get("setup/register", (c) => c.render(<RootUserSetup />));

export default AuthPageRoutes;
