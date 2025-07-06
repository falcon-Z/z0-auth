import { z } from "zod";
import { handleSetup } from "./service";
import { validateSuperAdmin } from "./validations";
import type { Context } from "hono";

/**
 * POST /api/v1/setup
 * Registers the platform super admin (first-time setup).
 * @param c - Hono context
 */
export const setupHandler = async (c: Context) => {
  if (c.req.method !== "POST") {
    return c.json({ error: "Method not allowed" }, 405);
  }
  const body = await c.req.json();
  const parse = validateSuperAdmin.safeParse(body);
  if (!parse.success) {
    return c.json({ error: "Invalid input", details: parse.error.errors }, 400);
  }
  try {
    const result = await handleSetup(parse.data);
    return c.json({ success: true, data: result }, 201);
  } catch (e: any) {
    return c.json({ error: e.message || "Setup failed" }, 500);
  }
};
