# OpenAPI Discovery Usage Guide

Machine-readable contract: see docs/openapi/specs/openapi.yaml.

This page explains how to retrieve the API contract in JSON or YAML formats.

## When to Use

- Use GET /.well-known/openapi.json when a tool expects JSON OpenAPI input.
- Use GET /.well-known/openapi.yaml when you want the canonical YAML contract.
- Use these endpoints for API client generation, contract validation, and operational discovery.

## Authentication and Context Requirements

- No authentication is required.
- These endpoints are read-only and expose the service API contract.
- They should be reachable from trusted operator or integration environments.

## GET /.well-known/openapi.json

Returns the OpenAPI 3.1 contract as JSON.

Curl:

```bash
curl -sS http://localhost:3000/.well-known/openapi.json | jq
```

Example response (truncated):

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Z0 Auth API",
    "version": "0.1.0"
  },
  "paths": {
    "/health/live": {
      "get": {}
    }
  }
}
```

## GET /.well-known/openapi.yaml

Returns the canonical OpenAPI 3.1 contract as YAML.

Curl:

```bash
curl -sS http://localhost:3000/.well-known/openapi.yaml
```

Example response (truncated):

```yaml
openapi: 3.1.0
info:
  title: Z0 Auth API
  version: 0.1.0
```

## Common Failure Flow

Method not allowed (405):

```bash
curl -i -X POST http://localhost:3000/.well-known/openapi.json
```

Expected response (headers excerpt + payload):

```http
HTTP/1.1 405 Method Not Allowed
Allow: GET
Content-Type: application/json; charset=utf-8
```

```json
{
  "error": "Method not allowed"
}
```

Spec loading failure (500):

```bash
curl -i http://localhost:3000/.well-known/openapi.json
```

Expected error payload:

```json
{
  "error": "Failed to load OpenAPI specification"
}
```
