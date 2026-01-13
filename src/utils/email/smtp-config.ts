/**
 * SMTP Configuration Management
 * Handles storage and retrieval of SMTP settings
 * Settings can be stored in environment variables or a config file
 */

import type { SMTPConfig } from "./types";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

const CONFIG_DIR = process.env.Z0_CONFIG_DIR ?? ".z0-auth";
const SMTP_CONFIG_FILE = "smtp.json";

interface StoredSMTPConfig extends Omit<SMTPConfig, "auth"> {
  auth: {
    user: string;
    // Password is encrypted when stored
    encryptedPassword?: string;
    // In development, password can be plain
    password?: string;
  };
}

/**
 * Get the path to the SMTP config file
 */
function getConfigPath(): string {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return join(homeDir, CONFIG_DIR, SMTP_CONFIG_FILE);
}

/**
 * Simple encryption for stored passwords
 * In production, use proper encryption or secrets management
 */
function encryptPassword(password: string): string {
  const key = process.env.SMTP_ENCRYPTION_KEY ?? process.env.APP_SECRET ?? "default-key";
  // Simple XOR encryption - for production, use proper encryption
  const encrypted = Buffer.from(password)
    .map((byte, i) => byte ^ key.charCodeAt(i % key.length))
    .toString("base64");
  return encrypted;
}

function decryptPassword(encrypted: string): string {
  const key = process.env.SMTP_ENCRYPTION_KEY ?? process.env.APP_SECRET ?? "default-key";
  const decrypted = Buffer.from(encrypted, "base64")
    .map((byte, i) => byte ^ key.charCodeAt(i % key.length))
    .toString();
  return decrypted;
}

/**
 * Load SMTP configuration from file or environment
 * Priority: Environment variables > Config file > Defaults
 */
export function loadSMTPConfig(): SMTPConfig | null {
  // Check environment variables first
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    return {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        password: process.env.SMTP_PASSWORD,
      },
      from: {
        name: process.env.SMTP_FROM_NAME ?? "Z0 Auth",
        email: process.env.SMTP_FROM_EMAIL ?? "noreply@example.com",
      },
    };
  }

  // Try loading from config file
  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      const stored: StoredSMTPConfig = JSON.parse(content);

      // Decrypt password if encrypted
      const password = stored.auth.encryptedPassword
        ? decryptPassword(stored.auth.encryptedPassword)
        : stored.auth.password ?? "";

      return {
        host: stored.host,
        port: stored.port,
        secure: stored.secure,
        auth: {
          user: stored.auth.user,
          password,
        },
        from: stored.from,
        connectionTimeout: stored.connectionTimeout,
        responseTimeout: stored.responseTimeout,
      };
    } catch (error) {
      console.error("[SMTP Config] Failed to load config:", error);
      return null;
    }
  }

  return null;
}

/**
 * Save SMTP configuration to file
 * Password is encrypted before storage
 */
export function saveSMTPConfig(config: SMTPConfig): void {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);

  // Ensure config directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Prepare config for storage (encrypt password)
  const stored: StoredSMTPConfig = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.auth.user,
      encryptedPassword: encryptPassword(config.auth.password),
    },
    from: config.from,
    connectionTimeout: config.connectionTimeout,
    responseTimeout: config.responseTimeout,
  };

  writeFileSync(configPath, JSON.stringify(stored, null, 2), "utf-8");
}

/**
 * Check if SMTP is configured
 */
export function isSMTPConfigured(): boolean {
  const config = loadSMTPConfig();
  return config !== null && config.host !== "" && config.auth.user !== "";
}

/**
 * Get SMTP configuration for display (password masked)
 */
export function getSMTPConfigMasked(): Partial<SMTPConfig> & { configured: boolean } {
  const config = loadSMTPConfig();

  if (!config) {
    return {
      configured: false,
    };
  }

  return {
    configured: true,
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.auth.user,
      password: "********",
    },
    from: config.from,
  };
}

/**
 * Delete SMTP configuration
 */
export function deleteSMTPConfig(): boolean {
  const configPath = getConfigPath();

  if (existsSync(configPath)) {
    try {
      const { unlinkSync } = require("fs");
      unlinkSync(configPath);
      return true;
    } catch (error) {
      console.error("[SMTP Config] Failed to delete config:", error);
      return false;
    }
  }

  return true;
}

/**
 * Validate SMTP configuration
 */
export function validateSMTPConfig(config: Partial<SMTPConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.host?.trim()) {
    errors.push("SMTP host is required");
  }

  if (!config.port || config.port < 1 || config.port > 65535) {
    errors.push("Valid SMTP port is required (1-65535)");
  }

  if (!config.auth?.user?.trim()) {
    errors.push("SMTP username is required");
  }

  if (!config.auth?.password) {
    errors.push("SMTP password is required");
  }

  if (!config.from?.email?.trim()) {
    errors.push("From email address is required");
  } else if (!isValidEmail(config.from.email)) {
    errors.push("Invalid from email address format");
  }

  if (!config.from?.name?.trim()) {
    errors.push("From name is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
