import { ErrorResponseBuilder } from "@z0/utils/error-handling";
import type { Context, Next } from "hono";
import type { TokenPayload } from "@z0/utils/auth";

// Middleware: Ensure user has access to this organization
// Access: Platform Managers OR Org Admins of this Org
export const requireOrgAccess = async (c: Context, next: Next) => {
    const user = c.get('user') as TokenPayload;
    const orgId = c.req.param('orgId');

    if (!user) {
        return c.json(ErrorResponseBuilder.authentication("Authentication required", "AUTH_REQUIRED"), 401);
    }

    // 1. Platform Manager - Access All
    if (user.type === 'platform_manager') {
        await next();
        return;
    }

    // 2. Org Admin - Access Own Org
    // user.orgId must match param orgId
    if (user.type === 'user' && user.orgId === orgId) {
        // Check for Admin Role
        // We assume 'role' field contains the role name like 'ORG_ADMIN'
        if (user.role === 'ORG_ADMIN') {
            await next();
            return;
        }
    }

    return c.json(ErrorResponseBuilder.authorization("Access denied. Insufficient permissions for this organization."), 403);
};
