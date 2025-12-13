import { Hono } from "hono";
import userProfile from "./profile";
import userSecurity from "./security";

const userRoutes = new Hono();

// Mount at root of /users
userRoutes.route("/", userProfile);
userRoutes.route("/", userSecurity);

export default userRoutes;
