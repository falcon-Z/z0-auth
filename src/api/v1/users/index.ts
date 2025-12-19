import { Hono } from "hono";
import userProfile from "./profile";
import userSecurity from "./security";
import userSessions from "./sessions";

const userRoutes = new Hono();

// Mount at root of /users
userRoutes.route("/", userProfile);
userRoutes.route("/", userSecurity);
userRoutes.route("/", userSessions);

export default userRoutes;
