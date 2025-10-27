import { Hono } from "hono";
import { validator } from "hono/validator";
import {
  handleSetup,
  checkSetupEligibility,
  validateEmail,
  validateOrganization,
} from "./handlers";
import {
  superAdminSetupSchema,
  validateEmailSchema,
  validateOrganizationSchema,
} from "./validations";
import { createRateLimit, rateLimitConfigs } from "@z0/utils/rate-limiter";

const setupAdmin = new Hono();

// Apply rate limiting to setup endpoints
const setupRateLimit = createRateLimit(rateLimitConfigs.strict);
const validationRateLimit = createRateLimit(rateLimitConfigs.auth);

/**
 * GET /api/setup/eligibility
 * Check if system is eligible for setup
 */
setupAdmin.get("/eligibility", validationRateLimit, checkSetupEligibility);

/**
 * POST /api/setup/validate/email
 * Validate email availability
 */
setupAdmin.post(
  "/validate/email",
  validationRateLimit,
  validator("json", (value, c) => {
    const parsed = validateEmailSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid request", issues: parsed.error.issues },
        400
      );
    }
    return parsed.data;
  }),
  validateEmail
);

/**
 * POST /api/setup/validate/organization
 * Validate organization name availability
 */
setupAdmin.post(
  "/validate/organization",
  validationRateLimit,
  validator("json", (value, c) => {
    const parsed = validateOrganizationSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid request", issues: parsed.error.issues },
        400
      );
    }
    return parsed.data;
  }),
  validateOrganization
);

/**
 * POST /api/setup
 * Complete super admin setup
 */
setupAdmin.post(
  "/",
  setupRateLimit,
  validator("json", (value, c) => {
    const parsed = superAdminSetupSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid request", issues: parsed.error.issues },
        400
      );
    }
    return parsed.data;
  }),
  handleSetup
);

export default setupAdmin;
