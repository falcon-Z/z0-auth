import { ErrorResponseBuilder } from "@z0/utils/error-handling";
import type { Context, Next } from "hono";
import type { TokenPayload } from "@z0/utils/auth";

export const requirePlatformManager = async (c: Context, next: Next) => {
    const user = c.get('user') as TokenPayload;
    if (!user || user.type !== 'platform_manager') {
        console.log("Access Denied in Middleware:", JSON.stringify(user));
        return c.json(ErrorResponseBuilder.authorization("Access denied. Platform Managers only."), 403);
    }
    await next();
};
