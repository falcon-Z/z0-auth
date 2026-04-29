#!/usr/bin/env bash
set -euo pipefail

# Minimal skill runner contract for agent workflows.
# Usage:
#   ./scripts/skills.sh list
#   ./scripts/skills.sh run <command> [args...]

cmd="${1:-}"

if [ -z "$cmd" ]; then
  echo "Usage: ./scripts/skills.sh <list|run> [args...]"
  exit 1
fi

case "$cmd" in
  list)
    echo "Available skill runner actions:"
    echo "- list"
    echo "- run <command> [args...]"
    ;;
  run)
    shift
    if [ "$#" -eq 0 ]; then
      echo "Usage: ./scripts/skills.sh run <command> [args...]"
      exit 1
    fi
    "$@"
    ;;
  *)
    echo "Unknown action: $cmd"
    echo "Usage: ./scripts/skills.sh <list|run> [args...]"
    exit 1
    ;;
esac
