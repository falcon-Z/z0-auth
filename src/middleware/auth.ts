import { verifyAccessTokenMiddleware } from "../utils/auth";

/**
 * Authentication middleware to verify JWT access tokens
 * This is an alias for verifyAccessTokenMiddleware from utils/auth
 */
export const authMiddleware = verifyAccessTokenMiddleware;
