/**
 * Z0 Auth - Validation Schemas
 * 
 * Lightweight validation using regex and custom validators.
 * No external schema libraries to keep Bun-native first approach.
 */

import { createError } from '@z0/src/lib/errors';
import type { ValidationErrorDetail } from '@z0/src/lib/types';

export interface ValidationSchema {
  [key: string]: Validator;
}

export interface Validator {
  type: string;
  required?: boolean;
  pattern?: RegExp;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  enum?: unknown[];
  custom?: (value: unknown) => boolean | string; // true/pass, false or string/error
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationErrorDetail[];
}

// Common regex patterns
export const PATTERNS = {
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  URL: /^https?:\/\/.+/,
  ALPHANUMERIC: /^[a-z0-9_-]+$/i,
  SCOPE: /^([a-z0-9_]+(\s+[a-z0-9_]+)*)?$/i, // Space-separated scope list
  STRONG_PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/, // 12+ chars, mixed case, digit, special
};

export class Validator {
  constructor(private schema: ValidationSchema) {}

  validate(data: unknown): ValidationResult {
    if (typeof data !== 'object' || data === null) {
      return {
        valid: false,
        errors: [{ field: '$root', code: 'invalid_type', message: 'Expected object' }],
      };
    }

    const obj = data as Record<string, unknown>;
    const errors: ValidationErrorDetail[] = [];

    for (const [field, validator] of Object.entries(this.schema)) {
      const value = obj[field];
      const fieldErrors = this.validateField(field, value, validator);
      errors.push(...fieldErrors);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private validateField(
    field: string,
    value: unknown,
    validator: Validator
  ): ValidationErrorDetail[] {
    const errors: ValidationErrorDetail[] = [];

    // Check required
    if (validator.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field,
        code: 'required',
        message: 'Field is required',
      });
      return errors;
    }

    // Skip validation if not required and not provided
    if (!validator.required && (value === undefined || value === null || value === '')) {
      return errors;
    }

    // Type check
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== validator.type) {
      errors.push({
        field,
        code: 'invalid_type',
        message: `Expected ${validator.type}, got ${actualType}`,
      });
      return errors;
    }

    // String validations
    if (typeof value === 'string') {
      if (validator.pattern && !validator.pattern.test(value)) {
        errors.push({
          field,
          code: 'pattern_mismatch',
          message: `Value does not match required pattern: ${validator.pattern.source}`,
        });
      }
      if (validator.minLength !== undefined && value.length < validator.minLength) {
        errors.push({
          field,
          code: 'min_length',
          message: `Minimum length is ${validator.minLength}, got ${value.length}`,
        });
      }
      if (validator.maxLength !== undefined && value.length > validator.maxLength) {
        errors.push({
          field,
          code: 'max_length',
          message: `Maximum length is ${validator.maxLength}, got ${value.length}`,
        });
      }
    }

    // Number validations
    if (typeof value === 'number') {
      if (validator.min !== undefined && value < validator.min) {
        errors.push({
          field,
          code: 'min_value',
          message: `Minimum value is ${validator.min}, got ${value}`,
        });
      }
      if (validator.max !== undefined && value > validator.max) {
        errors.push({
          field,
          code: 'max_value',
          message: `Maximum value is ${validator.max}, got ${value}`,
        });
      }
    }

    // Enum validation
    if (validator.enum && !validator.enum.includes(value)) {
      errors.push({
        field,
        code: 'invalid_enum',
        message: `Value must be one of: ${validator.enum.join(', ')}`,
      });
    }

    // Custom validation
    if (validator.custom) {
      const result = validator.custom(value);
      if (result !== true) {
        errors.push({
          field,
          code: 'custom_validation_failed',
          message: typeof result === 'string' ? result : 'Custom validation failed',
        });
      }
    }

    return errors;
  }
}

/**
 * Predefined validation schemas for common entities
 */

export const schemas = {
  // Identity/User schemas
  registerIdentity: new Validator({
    email: {
      type: 'string',
      required: true,
      pattern: PATTERNS.EMAIL,
      maxLength: 254,
    },
    password: {
      type: 'string',
      required: true,
      pattern: PATTERNS.STRONG_PASSWORD,
    },
    name: {
      type: 'string',
      maxLength: 255,
    },
  }),

  loginWithPassword: new Validator({
    email: {
      type: 'string',
      required: true,
      pattern: PATTERNS.EMAIL,
    },
    password: {
      type: 'string',
      required: true,
    },
  }),

  // Tenant schemas
  createTenant: new Validator({
    name: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 255,
    },
    display_name: {
      type: 'string',
      maxLength: 255,
    },
  }),

  // App schemas
  createApp: new Validator({
    name: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 255,
    },
    description: {
      type: 'string',
      maxLength: 1000,
    },
    allowed_redirect_uris: {
      type: 'array',
      required: true,
    },
  }),

  // OAuth2 schemas
  authorizeRequest: new Validator({
    client_id: {
      type: 'string',
      required: true,
    },
    response_type: {
      type: 'string',
      required: true,
      enum: ['code', 'token', 'id_token', 'code id_token', 'code token'],
    },
    redirect_uri: {
      type: 'string',
      required: true,
      pattern: PATTERNS.URL,
    },
    scope: {
      type: 'string',
      required: true,
      pattern: PATTERNS.SCOPE,
    },
    state: {
      type: 'string',
      maxLength: 500,
    },
  }),

  tokenRequest: new Validator({
    grant_type: {
      type: 'string',
      required: true,
      enum: ['authorization_code', 'refresh_token', 'password', 'client_credentials'],
    },
    code: {
      type: 'string',
    },
    refresh_token: {
      type: 'string',
    },
    username: {
      type: 'string',
    },
    password: {
      type: 'string',
    },
    client_id: {
      type: 'string',
      required: true,
    },
    client_secret: {
      type: 'string',
    },
  }),

  // TOTP schemas
  setupTOTP: new Validator({
    password: {
      type: 'string',
      required: true,
    },
  }),

  verifyTOTP: new Validator({
    code: {
      type: 'string',
      required: true,
      pattern: /^\d{6}$/,
    },
  }),
};
