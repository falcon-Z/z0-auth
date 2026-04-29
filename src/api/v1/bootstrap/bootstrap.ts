/**
 * Bootstrap Control Plane Endpoints
 * 
 * Manages one-time platform initialization and setup state detection.
 * These endpoints enable secure self-hosted deployment with zero pre-configuration.
 */

import { SQL } from 'bun';
import { hashSecret, generateRandomString, logger, PATTERNS } from '@z0/src/lib';
import { createDatabaseClient } from '@z0/database/runtime';
import { resolveDatabaseUrl } from '@z0/database/migration-runner';

type DbClient = {
  unsafe: (query: string, params?: unknown[]) => Promise<unknown>;
  begin: <T>(callback: (tx: unknown) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};

export interface BootstrapDependencies {
  createDatabaseClient: typeof createDatabaseClient;
  resolveDatabaseUrl: typeof resolveDatabaseUrl;
  hashSecret: typeof hashSecret;
  generateRandomString: typeof generateRandomString;
}

const defaultDependencies: BootstrapDependencies = {
  createDatabaseClient,
  resolveDatabaseUrl,
  hashSecret,
  generateRandomString,
};

export interface BootstrapStatusResponse {
  bootstrapped: boolean;
  requires_setup: boolean;
  timestamp: string;
}

export interface BootstrapInitializeRequest {
  platform_name: string;
  admin_email: string;
  admin_password: string;
  confirm_password: string;
}

export interface BootstrapInitializeResponse {
  platform_id: string;
  bootstrap_token: string;
  admin_email: string;
  setup_complete: boolean;
  timestamp: string;
}

function normalizeSqlCount(rawCount: unknown): bigint {
  if (typeof rawCount === 'bigint') {
    return rawCount >= 0n ? rawCount : 0n;
  }

  if (typeof rawCount === 'number') {
    if (!Number.isFinite(rawCount)) return 0n;
    const normalized = Math.trunc(rawCount);
    return normalized >= 0 ? BigInt(normalized) : 0n;
  }

  if (typeof rawCount === 'string') {
    const trimmed = rawCount.trim();
    if (!/^[+-]?\d+$/.test(trimmed)) return 0n;
    try {
      const parsed = BigInt(trimmed);
      return parsed >= 0n ? parsed : 0n;
    } catch {
      return 0n;
    }
  }

  return 0n;
}

/**
 * GET /api/v1/bootstrap/status
 * 
 * Check if platform initialization is already complete.
 * Returns whether setup wizard should be shown.
 */
export async function handleBootstrapStatus(
  _req: Request,
  deps: BootstrapDependencies = defaultDependencies
): Promise<Response> {
  const db = deps.createDatabaseClient(deps.resolveDatabaseUrl()) as unknown as DbClient;

  try {
    const rows = await db.unsafe(`
      SELECT COUNT(*) as platform_count
      FROM platforms
      WHERE deleted_at IS NULL
    `);

    const platformCount = normalizeSqlCount((rows as Array<{ platform_count: unknown }>)[0]?.platform_count);

    const response: BootstrapStatusResponse = {
      bootstrapped: platformCount > 0n,
      requires_setup: platformCount === 0n,
      timestamp: new Date().toISOString(),
    };

    return Response.json(response, { status: 200 });
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    logger.error('Bootstrap status check failed', normalizedError);
    return Response.json(
      { error: 'Failed to check bootstrap status' },
      { status: 500 }
    );
  } finally {
    await db.close();
  }
}

/**
 * POST /api/v1/bootstrap/initialize
 * 
 * One-time endpoint to initialize platform, create admin user, and issue bootstrap token.
 * Can only succeed once - subsequent calls fail if platform already exists.
 */
export async function handleBootstrapInitialize(
  req: Request,
  deps: BootstrapDependencies = defaultDependencies
): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json(
      { error: 'Method not allowed' },
      { status: 405 }
    );
  }

  // Parse request body
  let payload: BootstrapInitializeRequest;
  try {
    payload = await req.json() as BootstrapInitializeRequest;
  } catch {
    return Response.json(
      { error: 'Invalid JSON request body' },
      { status: 400 }
    );
  }

  // Validate input
  const validationErrors: Record<string, string> = {};

  if (!payload.platform_name || typeof payload.platform_name !== 'string') {
    validationErrors.platform_name = 'Platform name is required';
  } else if (payload.platform_name.length < 3 || payload.platform_name.length > 255) {
    validationErrors.platform_name = 'Platform name must be 3-255 characters';
  }

  if (!payload.admin_email || typeof payload.admin_email !== 'string') {
    validationErrors.admin_email = 'Admin email is required';
  } else if (!PATTERNS.EMAIL.test(payload.admin_email)) {
    validationErrors.admin_email = 'Invalid email format';
  }

  if (!payload.admin_password || typeof payload.admin_password !== 'string') {
    validationErrors.admin_password = 'Password is required';
  } else if (payload.admin_password.length < 12) {
    validationErrors.admin_password = 'Password must be at least 12 characters';
  } else if (!PATTERNS.STRONG_PASSWORD.test(payload.admin_password)) {
    validationErrors.admin_password = 'Password must contain uppercase, lowercase, number, and special character';
  }

  if (payload.confirm_password !== payload.admin_password) {
    validationErrors.confirm_password = 'Passwords do not match';
  }

  if (Object.keys(validationErrors).length > 0) {
    return Response.json(
      { error: 'Validation failed', details: validationErrors },
      { status: 400 }
    );
  }

  const db = deps.createDatabaseClient(deps.resolveDatabaseUrl()) as unknown as DbClient;

  try {
    // Start transaction
    const result = await db.begin(async (tx) => {
      // Check if platform already exists
      const existingRows = await (tx as SQL).unsafe(`
        SELECT COUNT(*) as platform_count
        FROM platforms
        WHERE deleted_at IS NULL
      `);

      const platformCount = normalizeSqlCount((existingRows as Array<{ platform_count: unknown }>)[0]?.platform_count);
      if (platformCount > 0n) {
        throw new Error('Platform already initialized');
      }

      // Create platform (UUID generated by PostgreSQL)
      const platformResult = await (tx as SQL).unsafe(`
        INSERT INTO platforms (name, display_name, created_at, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [payload.platform_name, payload.platform_name]);

      const platformId = (platformResult as Array<{ id: string }>)[0]?.id;
      if (!platformId) {
        throw new Error('Failed to create platform');
      }

      // Create platform admin
      const passwordHash = await deps.hashSecret(payload.admin_password);
      await (tx as unknown as SQL).unsafe(`
        INSERT INTO platform_admins (platform_id, email, password_hash, created_at, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [platformId, payload.admin_email, passwordHash]);

      // Create bootstrap token (valid for 24 hours)
      const bootstrapToken = deps.generateRandomString(32);
      const tokenHash = await deps.hashSecret(bootstrapToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await (tx as unknown as SQL).unsafe(`
        INSERT INTO bootstrap_tokens (platform_id, token_hash, created_at, expires_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
      `, [platformId, tokenHash, expiresAt.toISOString()]);

      return { platformId, bootstrapToken };
    });

    logger.info('Platform initialized successfully', {
      platformId: result.platformId,
      adminEmail: payload.admin_email,
    });

    const response: BootstrapInitializeResponse = {
      platform_id: result.platformId,
      bootstrap_token: result.bootstrapToken,
      admin_email: payload.admin_email,
      setup_complete: true,
      timestamp: new Date().toISOString(),
    };

    return Response.json(response, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage === 'Platform already initialized') {
      return Response.json(
        { error: 'Platform already initialized' },
        { status: 409 }
      );
    }

    const normalizedError = error instanceof Error ? error : new Error(errorMessage);
    logger.error('Bootstrap initialization failed', normalizedError);
    return Response.json(
      { error: 'Bootstrap initialization failed' },
      { status: 500 }
    );
  } finally {
    await db.close();
  }
}
