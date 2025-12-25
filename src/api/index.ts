import { Hono } from "hono";
import V1Routes from "./v1";
import setupAdmin from "./setup";
import AuthRoutes from "./auth";
import HealthRoutes from "./health";
import AdminKeyRoutes from "./admin/keys";
import SMTPAdminRoutes from "./admin/smtp";
import LockoutAdminRoutes from "./admin/security/lockouts";
import AuditLogsRoutes from "./admin/audit-logs";
import RequestTracesRoutes from "./admin/request-traces";

const API = new Hono();

API.route("/setup/", setupAdmin);
API.route("/auth/", AuthRoutes);
API.route("/v1/", V1Routes);
API.route("/health/", HealthRoutes);
API.route("/admin/keys/", AdminKeyRoutes);
API.route("/admin/smtp/", SMTPAdminRoutes);
API.route("/admin/security/", LockoutAdminRoutes);
API.route("/admin/audit-logs/", AuditLogsRoutes);
API.route("/admin/request-traces/", RequestTracesRoutes);

export default API;
