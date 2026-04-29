# Health API Usage Guide

Machine-readable contract: see docs/openapi/specs/core/health/health.yaml and docs/openapi/specs/openapi.yaml.

This page explains how to use health endpoints operationally.

## When to Use

- Use GET /health/live for process liveness checks.
- Use GET /health/ready for traffic readiness checks.
- Use GET /health only as a backward-compatible alias of /health/live.

## Authentication and Context Requirements

- No authentication is required for health probes.
- These endpoints are intended for load balancers, orchestrators, uptime checks, and operator diagnostics.
- GET /health/live verifies process health only; use GET /health/ready for dependency-aware traffic gating.

## Endpoint Behavior

### GET /health/live

- Purpose: Confirms the server process is running.
- Dependency checks: None.
- Expected status: 200.

Example response:

```json
{
  "status": "ok",
  "timestamp": "2026-04-28T16:00:00.000Z",
  "uptime": 42.15
}
```

Curl:

```bash
curl -sS http://localhost:3000/health/live | jq
```

### GET /health/ready

- Purpose: Confirms the service is ready to accept traffic.
- Dependency checks: Database connectivity and migration state.
- Expected status:
  - 200 when connected and pending migrations are 0
  - 503 otherwise

Ready example response:

```json
{
  "status": "ready",
  "database": {
    "connected": true,
    "migrations": {
      "applied": 11,
      "total": 11,
      "pending": 0
    }
  },
  "timestamp": "2026-04-28T16:00:00.000Z"
}
```

Not-ready example response:

```json
{
  "status": "not_ready",
  "database": {
    "connected": false,
    "migrations": {
      "applied": 10,
      "total": 11,
      "pending": 1
    }
  },
  "timestamp": "2026-04-28T16:00:00.000Z"
}
```

Curl:

```bash
curl -i http://localhost:3000/health/ready
```

### GET /health

- Purpose: Legacy compatibility route.
- Behavior: Same payload as GET /health/live.

Curl:

```bash
curl -sS http://localhost:3000/health | jq
```

## Common Operational Checks

Method-not-allowed example (405 with Allow header):

```bash
curl -i -X POST http://localhost:3000/health/live
```

Expected response includes `Allow: GET`.

Readiness loop during startup:

```bash
until curl -fsS http://localhost:3000/health/ready >/dev/null; do
  echo "waiting for readiness..."
  sleep 1
done
echo "service is ready"
```

Quick liveness and readiness together:

```bash
curl -sS http://localhost:3000/health/live | jq
curl -sS http://localhost:3000/health/ready | jq
```
