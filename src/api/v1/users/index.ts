import { Hono } from "hono";
import userProfile from "./profile";
import userSecurity from "./security";
import userSessions from "./sessions";
import userDevices from "./devices";
import userExternalIdentities from "./external-identities";

const userRoutes = new Hono();

// Mount at root of /users
userRoutes.route("/", userProfile);
userRoutes.route("/", userSecurity);
userRoutes.route("/", userSessions);
userRoutes.route("/", userDevices);
userRoutes.route("/external-identities", userExternalIdentities);

export default userRoutes;
