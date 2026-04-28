#!/usr/bin/env bash
set -euo pipefail

BASE_REF="${1:-}"
HEAD_REF="${2:-HEAD}"

if [[ -z "$BASE_REF" ]]; then
  echo "ERROR: Missing base ref. Usage: scripts/premerge-api-sync-check.sh <base-ref> [head-ref]"
  exit 2
fi

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git is required"
  exit 2
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "ERROR: bun is required"
  exit 2
fi

CHANGED_FILES=$(git diff --name-only "$BASE_REF...$HEAD_REF")
API_CHANGED=$(echo "$CHANGED_FILES" | grep -E '^src/api/.*\.ts$' | grep -vE '^src/api/README\.ts$' || true)

if [[ -z "$API_CHANGED" ]]; then
  echo "No API implementation changes detected. Pre-merge API sync check passed."
  exit 0
fi

echo "Detected API changes:"
echo "$API_CHANGED"

FAIL=0
for api_file in $API_CHANGED; do
  stem=$(basename "$api_file" .ts)
  test_file="tests/api/${stem}.test.ts"
  yaml_file="docs/openapi/${stem}.yaml"
  md_file="docs/openapi/${stem}.md"

  printf "\nChecking sync for: %s\n" "$api_file"

  if [[ ! -f "$test_file" ]]; then
    echo "  FAIL: Missing expected test file: $test_file"
    FAIL=1
  elif ! echo "$CHANGED_FILES" | grep -q "^${test_file}$"; then
    echo "  FAIL: API file changed but test file was not updated: $test_file"
    FAIL=1
  else
    echo "  OK: Test file updated: $test_file"
  fi

  if [[ -f "$yaml_file" ]]; then
    if ! echo "$CHANGED_FILES" | grep -Eq "^${yaml_file}$|^docs/openapi/openapi\.yaml$"; then
      echo "  FAIL: API file changed but OpenAPI YAML was not updated: $yaml_file or docs/openapi/openapi.yaml"
      FAIL=1
    else
      echo "  OK: OpenAPI YAML updated"
    fi
  else
    if ! echo "$CHANGED_FILES" | grep -q '^docs/openapi/openapi.yaml$'; then
      echo "  FAIL: No per-endpoint YAML found and root OpenAPI was not updated: docs/openapi/openapi.yaml"
      FAIL=1
    else
      echo "  OK: Root OpenAPI updated"
    fi
  fi

  if [[ -f "$md_file" ]]; then
    if ! echo "$CHANGED_FILES" | grep -q "^${md_file}$"; then
      echo "  FAIL: API file changed but usage guide was not updated: $md_file"
      FAIL=1
    else
      echo "  OK: Usage guide updated: $md_file"
    fi
  fi
done

if [[ "$FAIL" -ne 0 ]]; then
  printf "\nPre-merge API sync checks failed.\n"
  exit 1
fi

printf "\nRunning API tests to ensure behavior and tests are in sync...\n"
bun test tests/api

echo "Pre-merge API sync checks passed."
