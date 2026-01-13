/**
 * App User Portal
 *
 * Server-side rendered pages for app-level users.
 * These users only have AppMembership and do not see org/platform UI.
 *
 * Routes:
 * - GET  /api/portal/:appSlug/login     - Render login page
 * - POST /api/portal/:appSlug/login     - Handle login
 * - GET  /api/portal/:appSlug/register  - Render registration page (if enabled)
 * - POST /api/portal/:appSlug/register  - Handle registration
 * - GET  /api/portal/:appSlug/dashboard - Render app user dashboard
 * - GET  /api/portal/:appSlug/profile   - Render profile page
 * - POST /api/portal/:appSlug/logout    - Handle logout
 */

import { Hono } from "hono";
import appRoutes from "./routes";

const portal = new Hono();

// Mount app-specific routes
portal.route("/:appSlug", appRoutes);

export default portal;
