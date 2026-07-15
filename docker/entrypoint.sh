#!/bin/sh
set -eu

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required." >&2
  exit 1
fi

bun /app/src/scripts/db-migrate.ts
exec bun /app/dist/server.js
