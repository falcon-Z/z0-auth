#!/bin/sh
set -eu

project="z0-auth-smoke-$$"
export Z0_AUTH_PORT=0
Z0_AUTH_DB_AUTH="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
export Z0_AUTH_DB_AUTH

cleanup() {
  docker compose -p "$project" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker compose config --quiet
docker compose -p "$project" up --build -d --wait

published_address="$(docker compose -p "$project" port app 3000)"
curl --fail --silent --show-error "http://${published_address}/api/ready" >/dev/null

docker compose -p "$project" exec -T app sh -c '
  test "$(id -u)" = 1000
  test "$(stat -c %a /var/lib/z0-auth/instance-keys.json)" = 600
  test ! -e /app/.env
  test ! -e /app/.data
  test ! -e /app/node_modules
  test ! -e /app/tests
'

key_hash_before="$(docker compose -p "$project" exec -T app sha256sum /var/lib/z0-auth/instance-keys.json | cut -d " " -f 1)"
migration_count="$(docker compose -p "$project" exec -T postgres psql -U z0auth -d z0auth -Atc 'SELECT count(*) FROM schema_migrations')"
test "$migration_count" -gt 0

docker compose -p "$project" exec -T postgres psql -U z0auth -d z0auth -v ON_ERROR_STOP=1 -c \
  "CREATE TABLE container_smoke_probe (value TEXT PRIMARY KEY); INSERT INTO container_smoke_probe VALUES ('persists');" >/dev/null

docker compose -p "$project" up -d --force-recreate postgres app --wait

key_hash_after="$(docker compose -p "$project" exec -T app sha256sum /var/lib/z0-auth/instance-keys.json | cut -d " " -f 1)"
test "$key_hash_before" = "$key_hash_after"
test "$(docker compose -p "$project" exec -T postgres psql -U z0auth -d z0auth -Atc "SELECT value FROM container_smoke_probe")" = "persists"

image_id="$(docker compose -p "$project" images -q app)"
missing_db_log="$(mktemp)"
if docker run --rm "$image_id" >"$missing_db_log" 2>&1; then
  rm -f "$missing_db_log"
  echo "Image unexpectedly started without DATABASE_URL." >&2
  exit 1
fi
grep -q "DATABASE_URL is required" "$missing_db_log"
rm -f "$missing_db_log"

echo "Docker smoke test passed."
