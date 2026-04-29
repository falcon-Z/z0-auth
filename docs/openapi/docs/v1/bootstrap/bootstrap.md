# Bootstrap API Usage Guide

Machine-readable contract: see docs/openapi/specs/v1/bootstrap/bootstrap.yaml and docs/openapi/specs/openapi.yaml.

This page explains how to perform first-time setup and verify bootstrap state.

## When to Use

- Use GET /api/v1/bootstrap/status before showing setup UI to determine whether initialization is required.
- Use POST /api/v1/bootstrap/initialize exactly once during first-time deployment setup.
- Use status again after initialization to confirm the deployment transitioned to bootstrapped state.

## Authentication and Context Requirements

- No bearer token is required for these endpoints.
- These routes are intended only for a freshly deployed, not-yet-configured environment.
- POST /api/v1/bootstrap/initialize is a one-time control-plane operation and should be restricted by network and deployment controls.

## Bootstrap Workflow

1. Check bootstrap status.
2. If requires_setup is true, call initialize once.
3. Persist the returned bootstrap token securely.
4. Continue with tenant/app setup flows.

## GET /api/v1/bootstrap/status

Use this endpoint to decide whether initialization is still required.

Success example:

```json
{
  "bootstrapped": false,
  "requires_setup": true,
  "timestamp": "2026-04-28T16:00:00.000Z"
}
```

Curl:

```bash
curl -sS http://localhost:3000/api/v1/bootstrap/status | jq
```

## POST /api/v1/bootstrap/initialize

One-time initialization endpoint. It creates:

- the platform row
- the first platform admin
- a bootstrap token (returned once in clear text)

Request body:

```json
{
  "platform_name": "Acme Security",
  "admin_email": "admin@acme.test",
  "admin_password": "StrongPass123!",
  "confirm_password": "StrongPass123!"
}
```

Validation rules:

- platform_name: required, 3 to 255 chars
- admin_email: required, valid email
- admin_password: required, minimum 12 chars, must include upper/lower/digit/special
- confirm_password: must equal admin_password

### Successful Initialize

Curl:

```bash
curl -sS -X POST http://localhost:3000/api/v1/bootstrap/initialize \
  -H "Content-Type: application/json" \
  -d '{
    "platform_name": "Acme Security",
    "admin_email": "admin@acme.test",
    "admin_password": "StrongPass123!",
    "confirm_password": "StrongPass123!"
  }' | jq
```

Success response (201):

```json
{
  "platform_id": "550e8400-e29b-41d4-a716-446655440000",
  "bootstrap_token": "f8df2786f1f44d18a0a5f66e1ddf7a73f00a5a95d5b6f130e96c15a6917ccf4a",
  "admin_email": "admin@acme.test",
  "setup_complete": true,
  "timestamp": "2026-04-28T16:00:00.000Z"
}
```

### Common Failure Flows

Method not allowed (405 with Allow header):

```bash
curl -i -X POST http://localhost:3000/api/v1/bootstrap/status
```

Expected response includes `Allow: GET`.

Validation error (400):

```bash
curl -sS -X POST http://localhost:3000/api/v1/bootstrap/initialize \
  -H "Content-Type: application/json" \
  -d '{
    "platform_name": "Acme Security",
    "admin_email": "not-an-email",
    "admin_password": "weak",
    "confirm_password": "mismatch"
  }' | jq
```

Already initialized (409):

```bash
curl -i -X POST http://localhost:3000/api/v1/bootstrap/initialize \
  -H "Content-Type: application/json" \
  -d '{
    "platform_name": "Acme Security",
    "admin_email": "admin@acme.test",
    "admin_password": "StrongPass123!",
    "confirm_password": "StrongPass123!"
  }'
```

## End-to-End Quick Start Script

```bash
set -euo pipefail

curl -sS http://localhost:3000/api/v1/bootstrap/status | jq

curl -sS -X POST http://localhost:3000/api/v1/bootstrap/initialize \
  -H "Content-Type: application/json" \
  -d '{
    "platform_name": "Acme Security",
    "admin_email": "admin@acme.test",
    "admin_password": "StrongPass123!",
    "confirm_password": "StrongPass123!"
  }' | jq

curl -sS http://localhost:3000/api/v1/bootstrap/status | jq
```
