/**
 * Health Check Endpoints
 * 
 * Split into liveness (fast, always OK) and readiness (checks database state)
 * following Kubernetes health check conventions.
 */

import { checkDatabaseReadiness } from '../../database/runtime';

export interface LivenessResponse {
  status: 'ok';
  timestamp: string;
  uptime: number;
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  database: {
    connected: boolean;
    migrations: {
      applied: number;
      total: number;
      pending: number;
    };
  };
  timestamp: string;
}

const serverStartTime = Date.now();

/**
 * GET /health/live
 * 
 * Liveness probe - returns 200 if server process is alive.
 * Does NOT check database or migrations.
 * Used by load balancers to detect dead processes.
 */
export async function handleLivenessCheck(_req: Request): Promise<Response> {
  const uptime = (Date.now() - serverStartTime) / 1000; // seconds

  return Response.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime,
    } as LivenessResponse,
    { status: 200 }
  );
}

/**
 * GET /health/ready
 * 
 * Readiness probe - returns 200 only if server is ready to accept traffic.
 * Checks database connectivity and migration status.
 * Returns 503 if migrations are pending or database is unreachable.
 */
export async function handleReadinessCheck(_req: Request): Promise<Response> {
  const readiness = await checkDatabaseReadiness();

  const isReady = readiness.connected && readiness.migrations.pending === 0;

  const response: ReadinessResponse = {
    status: isReady ? 'ready' : 'not_ready',
    database: readiness,
    timestamp: new Date().toISOString(),
  };

  return Response.json(response, {
    status: isReady ? 200 : 503,
  });
}
