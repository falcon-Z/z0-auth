/**
 * User Metadata Schema Management API
 * Allows organizations to define custom user metadata fields with JSON Schema validation
 */

import { Hono } from "hono";
import { db } from "@z0/utils/db/client";
import {
  verifyAccessTokenMiddleware,
  type TokenPayload,
} from "@z0/utils/auth";
import {
  ErrorResponseBuilder,
  RequestContext,
  Logger,
} from "@z0/utils/error-handling";
import { z } from "zod";
import { validator } from "hono/validator";
import { AuditLogger } from "@z0/utils/audit-logger";
import { requireOrgMembership, requireScope } from "@z0/utils/org-access";
import { requireOrgAccess } from "@z0/middleware/require-scope";

const metadataSchemas = new Hono();

// Apply auth middleware to all routes
metadataSchemas.use("*", verifyAccessTokenMiddleware);

// JSON Schema property types
const jsonSchemaPropertySchema = z.object({
  type: z.enum(["string", "number", "integer", "boolean", "array", "object"]),
  title: z.string().optional(),
  description: z.string().optional(),
  default: z.any().optional(),
  enum: z.array(z.any()).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  pattern: z.string().optional(),
  format: z.string().optional(),
  items: z.any().optional(), // For array types
  properties: z.any().optional(), // For object types
  required: z.array(z.string()).optional(), // For object types
});

// JSON Schema format for metadata
const jsonSchemaSchema = z.object({
  type: z.literal("object"),
  properties: z.record(jsonSchemaPropertySchema),
  required: z.array(z.string()).optional(),
  additionalProperties: z.boolean().optional().default(false),
});

const createSchemaValidation = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, {
    message: "Name must start with a letter and contain only alphanumeric characters and underscores",
  }),
  description: z.string().max(500).optional(),
  schema: jsonSchemaSchema,
  isGlobal: z.boolean().optional().default(false),
  requiredRole: z.enum(["ORG_OWNER", "ORG_ADMIN", "ORG_MEMBER"]).optional().default("ORG_ADMIN"),
});

const updateSchemaValidation = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).optional(),
  description: z.string().max(500).nullable().optional(),
  schema: jsonSchemaSchema.optional(),
  isActive: z.boolean().optional(),
  isGlobal: z.boolean().optional(),
  requiredRole: z.enum(["ORG_OWNER", "ORG_ADMIN", "ORG_MEMBER"]).optional(),
});

/**
 * GET /:orgId/metadata-schemas
 * List metadata schemas for an organization
 */
metadataSchemas.get(
  "/:orgId/metadata-schemas",
  requireOrgMembership(),
  requireScope("org:settings:read"),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const { orgId } = c.req.param();
    const { active, page = "1", limit = "20" } = c.req.query();

    try {
      const pageNum = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const skip = (pageNum - 1) * limitNum;

      const where: any = { organizationId: orgId };
      if (active !== undefined) {
        where.isActive = active === "true";
      }

      const [schemas, total] = await Promise.all([
        db.userMetadataSchema.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
          select: {
            id: true,
            name: true,
            description: true,
            schema: true,
            isActive: true,
            version: true,
            isGlobal: true,
            requiredRole: true,
            createdAt: true,
            updatedAt: true,
            createdBy: true,
          },
        }),
        db.userMetadataSchema.count({ where }),
      ]);

      return c.json({
        success: true,
        data: schemas,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to list metadata schemas", { error: error.message, orgId, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to list metadata schemas", "LIST_FAILED"),
        500
      );
    }
  }
);

/**
 * POST /:orgId/metadata-schemas
 * Create a new metadata schema
 */
metadataSchemas.post(
  "/:orgId/metadata-schemas",
  requireOrgMembership(),
  requireScope("org:settings:write"),
  validator("json", (value, c) => {
    const parsed = createSchemaValidation.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid schema data",
          parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          }))
        ),
        400
      );
    }
    return parsed.data;
  }),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const { orgId } = c.req.param();
    const user = c.get("user") as TokenPayload;
    const body = c.req.valid("json");

    try {
      // Check if schema with same name exists
      const existing = await db.userMetadataSchema.findFirst({
        where: {
          organizationId: orgId,
          name: body.name,
          isActive: true,
        },
      });

      if (existing) {
        return c.json(
          ErrorResponseBuilder.conflict(`A metadata schema with name '${body.name}' already exists`),
          409
        );
      }

      const schema = await db.userMetadataSchema.create({
        data: {
          organizationId: orgId,
          name: body.name,
          description: body.description,
          schema: body.schema,
          isGlobal: body.isGlobal,
          requiredRole: body.requiredRole,
          createdBy: user.userId,
        },
      });

      await AuditLogger.logOrganizationManagement(
        "METADATA_SCHEMA_CREATED",
        user.userId,
        orgId,
        {
          metadata: {
            schemaId: schema.id,
            schemaName: schema.name,
          },
        }
      );

      Logger.info("Metadata schema created", {
        schemaId: schema.id,
        schemaName: schema.name,
        orgId,
        userId: user.userId,
        requestId,
      });

      return c.json(
        {
          success: true,
          message: "Metadata schema created successfully",
          data: schema,
          requestId,
        },
        201
      );
    } catch (error: any) {
      Logger.error("Failed to create metadata schema", { error: error.message, orgId, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to create metadata schema", "CREATE_FAILED"),
        500
      );
    }
  }
);

/**
 * GET /:orgId/metadata-schemas/:schemaId
 * Get a specific metadata schema
 */
metadataSchemas.get(
  "/:orgId/metadata-schemas/:schemaId",
  requireOrgMembership(),
  requireScope("org:settings:read"),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const { orgId, schemaId } = c.req.param();

    try {
      const schema = await db.userMetadataSchema.findFirst({
        where: {
          id: schemaId,
          organizationId: orgId,
        },
      });

      if (!schema) {
        return c.json(ErrorResponseBuilder.notFound("Metadata schema not found"), 404);
      }

      return c.json({
        success: true,
        data: schema,
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to get metadata schema", { error: error.message, schemaId, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to get metadata schema", "GET_FAILED"),
        500
      );
    }
  }
);

/**
 * PUT /:orgId/metadata-schemas/:schemaId
 * Update a metadata schema (creates new version)
 */
metadataSchemas.put(
  "/:orgId/metadata-schemas/:schemaId",
  requireOrgMembership(),
  requireScope("org:settings:write"),
  validator("json", (value, c) => {
    const parsed = updateSchemaValidation.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid schema data",
          parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          }))
        ),
        400
      );
    }
    return parsed.data;
  }),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const { orgId, schemaId } = c.req.param();
    const user = c.get("user") as TokenPayload;
    const body = c.req.valid("json");

    try {
      const existingSchema = await db.userMetadataSchema.findFirst({
        where: {
          id: schemaId,
          organizationId: orgId,
        },
      });

      if (!existingSchema) {
        return c.json(ErrorResponseBuilder.notFound("Metadata schema not found"), 404);
      }

      // If schema definition is changing, increment version
      const schemaChanged = body.schema && JSON.stringify(body.schema) !== JSON.stringify(existingSchema.schema);

      const updateData: any = {
        ...body,
        updatedAt: new Date(),
      };

      if (schemaChanged) {
        updateData.version = existingSchema.version + 1;
      }

      // Check for name conflicts if name is being changed
      if (body.name && body.name !== existingSchema.name) {
        const nameConflict = await db.userMetadataSchema.findFirst({
          where: {
            organizationId: orgId,
            name: body.name,
            isActive: true,
            id: { not: schemaId },
          },
        });

        if (nameConflict) {
          return c.json(
            ErrorResponseBuilder.conflict(`A metadata schema with name '${body.name}' already exists`),
            409
          );
        }
      }

      const updated = await db.userMetadataSchema.update({
        where: { id: schemaId },
        data: updateData,
      });

      await AuditLogger.logOrganizationManagement(
        "METADATA_SCHEMA_UPDATED",
        user.userId,
        orgId,
        {
          metadata: {
            schemaId: updated.id,
            schemaName: updated.name,
            previousVersion: existingSchema.version,
            newVersion: updated.version,
            schemaChanged,
          },
        }
      );

      Logger.info("Metadata schema updated", {
        schemaId: updated.id,
        schemaName: updated.name,
        version: updated.version,
        orgId,
        userId: user.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: schemaChanged
          ? `Metadata schema updated to version ${updated.version}`
          : "Metadata schema updated successfully",
        data: updated,
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to update metadata schema", { error: error.message, schemaId, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to update metadata schema", "UPDATE_FAILED"),
        500
      );
    }
  }
);

/**
 * DELETE /:orgId/metadata-schemas/:schemaId
 * Delete (deactivate) a metadata schema
 */
metadataSchemas.delete(
  "/:orgId/metadata-schemas/:schemaId",
  requireOrgMembership(),
  requireScope("org:settings:delete"),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const { orgId, schemaId } = c.req.param();
    const user = c.get("user") as TokenPayload;

    try {
      const schema = await db.userMetadataSchema.findFirst({
        where: {
          id: schemaId,
          organizationId: orgId,
        },
      });

      if (!schema) {
        return c.json(ErrorResponseBuilder.notFound("Metadata schema not found"), 404);
      }

      // Soft delete - mark as inactive
      await db.userMetadataSchema.update({
        where: { id: schemaId },
        data: { isActive: false },
      });

      await AuditLogger.logOrganizationManagement(
        "METADATA_SCHEMA_DELETED",
        user.userId,
        orgId,
        {
          metadata: {
            schemaId: schema.id,
            schemaName: schema.name,
          },
        }
      );

      Logger.info("Metadata schema deleted", {
        schemaId: schema.id,
        schemaName: schema.name,
        orgId,
        userId: user.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: "Metadata schema deleted successfully",
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to delete metadata schema", { error: error.message, schemaId, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to delete metadata schema", "DELETE_FAILED"),
        500
      );
    }
  }
);

/**
 * GET /:orgId/metadata-schemas/:schemaId/versions
 * List all versions of a metadata schema
 */
metadataSchemas.get(
  "/:orgId/metadata-schemas/:schemaId/versions",
  requireOrgMembership(),
  requireScope("org:settings:read"),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const { orgId, schemaId } = c.req.param();

    try {
      // Get the current schema to find the name
      const currentSchema = await db.userMetadataSchema.findFirst({
        where: {
          id: schemaId,
          organizationId: orgId,
        },
        select: { name: true },
      });

      if (!currentSchema) {
        return c.json(ErrorResponseBuilder.notFound("Metadata schema not found"), 404);
      }

      // Find all versions of schemas with the same name
      const versions = await db.userMetadataSchema.findMany({
        where: {
          organizationId: orgId,
          name: currentSchema.name,
        },
        orderBy: { version: "desc" },
        select: {
          id: true,
          name: true,
          description: true,
          schema: true,
          version: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
        },
      });

      return c.json({
        success: true,
        data: versions,
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to list schema versions", { error: error.message, schemaId, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to list schema versions", "LIST_VERSIONS_FAILED"),
        500
      );
    }
  }
);

/**
 * POST /:orgId/metadata-schemas/:schemaId/validate
 * Validate data against a metadata schema
 */
metadataSchemas.post(
  "/:orgId/metadata-schemas/:schemaId/validate",
  requireOrgMembership(),
  requireScope("org:settings:read"),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const { orgId, schemaId } = c.req.param();

    try {
      const schema = await db.userMetadataSchema.findFirst({
        where: {
          id: schemaId,
          organizationId: orgId,
          isActive: true,
        },
      });

      if (!schema) {
        return c.json(ErrorResponseBuilder.notFound("Metadata schema not found"), 404);
      }

      const body = await c.req.json();
      const { data } = body;

      if (data === undefined) {
        return c.json(
          ErrorResponseBuilder.validation("Missing data to validate", [
            { field: "data", message: "data field is required" },
          ]),
          400
        );
      }

      // Simple JSON Schema validation
      const errors = validateAgainstSchema(data, schema.schema as any);

      if (errors.length > 0) {
        return c.json({
          success: true,
          valid: false,
          errors,
          requestId,
        });
      }

      return c.json({
        success: true,
        valid: true,
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to validate against schema", { error: error.message, schemaId, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to validate data", "VALIDATION_FAILED"),
        500
      );
    }
  }
);

/**
 * Simple JSON Schema validator
 * Validates data against a JSON Schema definition
 */
function validateAgainstSchema(data: any, schema: any): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];

  if (schema.type === "object") {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      errors.push({ field: "$", message: "Expected an object" });
      return errors;
    }

    // Check required properties
    if (schema.required) {
      for (const required of schema.required) {
        if (!(required in data)) {
          errors.push({ field: required, message: `Property '${required}' is required` });
        }
      }
    }

    // Check additional properties
    if (schema.additionalProperties === false) {
      const allowed = Object.keys(schema.properties || {});
      for (const key of Object.keys(data)) {
        if (!allowed.includes(key)) {
          errors.push({ field: key, message: `Additional property '${key}' is not allowed` });
        }
      }
    }

    // Validate each property
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties) as any) {
        if (key in data) {
          const propErrors = validateProperty(data[key], propSchema, key);
          errors.push(...propErrors);
        }
      }
    }
  }

  return errors;
}

function validateProperty(value: any, schema: any, path: string): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];

  // Type validation
  const jsType = typeof value;
  const schemaType = schema.type;

  switch (schemaType) {
    case "string":
      if (jsType !== "string") {
        errors.push({ field: path, message: "Expected a string" });
        return errors;
      }
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push({ field: path, message: `Minimum length is ${schema.minLength}` });
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push({ field: path, message: `Maximum length is ${schema.maxLength}` });
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        errors.push({ field: path, message: `Value does not match pattern ${schema.pattern}` });
      }
      if (schema.enum && !schema.enum.includes(value)) {
        errors.push({ field: path, message: `Value must be one of: ${schema.enum.join(", ")}` });
      }
      break;

    case "number":
    case "integer":
      if (jsType !== "number") {
        errors.push({ field: path, message: `Expected a ${schemaType}` });
        return errors;
      }
      if (schemaType === "integer" && !Number.isInteger(value)) {
        errors.push({ field: path, message: "Expected an integer" });
      }
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({ field: path, message: `Minimum value is ${schema.minimum}` });
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({ field: path, message: `Maximum value is ${schema.maximum}` });
      }
      break;

    case "boolean":
      if (jsType !== "boolean") {
        errors.push({ field: path, message: "Expected a boolean" });
      }
      break;

    case "array":
      if (!Array.isArray(value)) {
        errors.push({ field: path, message: "Expected an array" });
        return errors;
      }
      if (schema.items) {
        value.forEach((item: any, index: number) => {
          const itemErrors = validateProperty(item, schema.items, `${path}[${index}]`);
          errors.push(...itemErrors);
        });
      }
      break;

    case "object":
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        errors.push({ field: path, message: "Expected an object" });
        return errors;
      }
      const nestedErrors = validateAgainstSchema(value, schema);
      errors.push(...nestedErrors.map((e) => ({ ...e, field: `${path}.${e.field}` })));
      break;
  }

  return errors;
}

export default metadataSchemas;
